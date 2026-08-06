import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { PlatformRole, type PrismaClient } from '@casas/database';
import { AuditAction, AuditService } from '../../common/audit/audit.service';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AccessTokenService,
  REFRESH_TOKEN_TTL_SECONDS,
} from '../../common/auth/access-token.service';
import { TokenService } from '../../common/crypto/token.service';
import { PrismaService, type PrismaTx } from '../../common/prisma/prisma.service';
import { AppError, TooManyRequestsError, UnprocessableError } from '../../common/http/app.errors';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { NotificationsService } from '../notifications/notifications.service';

/** Vida del código de un solo uso. Corta a propósito. */
const OTP_TTL_MINUTES = 10;
/** Intentos antes de invalidar el código. */
const OTP_MAX_ATTEMPTS = 5;
/** Códigos que se pueden pedir por correo dentro de la ventana. */
const OTP_REQUESTS_PER_WINDOW = 5;
const OTP_WINDOW_MINUTES = 15;

const OTP_PURPOSE = 'LOGIN';

export interface IssuedSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly userId: string;
  readonly sessionId: string;
}

export interface RequestContext {
  readonly ipAddress?: string | undefined;
  readonly userAgent?: string | undefined;
  readonly correlationId?: string | undefined;
}

/**
 * Autenticación por correo y código de un solo uso.
 *
 * No hay contraseñas. El modelo queda compatible con MFA futuro porque `User`
 * ya tiene `mfaEnabled` y el secreto cifrado; simplemente todavía no se exige.
 */
@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly accessTokens: AccessTokenService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Solicita un código de acceso.
   *
   * **Responde igual exista o no el correo.** Es lo que impide usar este endpoint
   * para enumerar usuarios: quien prueba correos ajenos recibe siempre la misma
   * respuesta y no puede distinguir un alta de un correo desconocido.
   */
  async requestCode(email: string, context: RequestContext): Promise<void> {
    const destination = email.toLowerCase();

    const since = new Date(Date.now() - OTP_WINDOW_MINUTES * 60_000);
    const recentRequests = await this.prisma.oneTimeCode.count({
      where: { destination, purpose: OTP_PURPOSE, createdAt: { gte: since } },
    });

    if (recentRequests >= OTP_REQUESTS_PER_WINDOW) {
      throw new TooManyRequestsError(
        'Pediste demasiados códigos. Esperá unos minutos antes de reintentar.',
      );
    }

    const code = this.tokens.generateOtpCode();
    const codeHash = this.tokens.hashOtpCode(code, destination);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

    const existingUser = await this.prisma.user.findUnique({ where: { email: destination } });

    await this.prisma.$transaction(async (tx) => {
      // Los códigos anteriores del mismo destino dejan de servir: siempre hay
      // como máximo uno vigente por correo.
      await tx.oneTimeCode.updateMany({
        where: { destination, purpose: OTP_PURPOSE, consumedAt: null },
        data: { consumedAt: new Date() },
      });

      await tx.oneTimeCode.create({
        data: {
          destination,
          purpose: OTP_PURPOSE,
          codeHash,
          expiresAt,
          userId: existingUser?.id ?? null,
        },
      });

      await this.audit.record(tx, {
        action: AuditAction.ACCESS_CODE_REQUESTED,
        entityType: 'OneTimeCode',
        entityId: destination,
        actor: {
          userId: existingUser?.id ?? null,
          role: PlatformRole.SYSTEM,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        // Se audita que se pidió un código, nunca el código (INV-AUD-02).
        after: { destination, expiresAt: expiresAt.toISOString() },
        correlationId: context.correlationId,
      });
    });

    await this.notifications.sendAccessCode(destination, code, OTP_TTL_MINUTES);
  }

  /**
   * Valida el código y abre una sesión.
   *
   * Si el correo no tenía usuario, lo crea: el primer ingreso es también el alta.
   * El usuario queda sin rol hasta que completa un perfil — un usuario
   * autenticado sin perfil no puede operar como familia ni como trabajadora.
   */
  async verifyCode(email: string, code: string, context: RequestContext): Promise<IssuedSession> {
    const destination = email.toLowerCase();

    const record = await this.prisma.oneTimeCode.findFirst({
      where: { destination, purpose: OTP_PURPOSE, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (record === null || record.expiresAt < new Date()) {
      await this.recordFailedLogin(destination, 'CODE_MISSING_OR_EXPIRED', context);
      throw new UnprocessableError(
        'AUTH_CODE_INVALID',
        'El código no es válido o venció. Pedí uno nuevo.',
      );
    }

    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      await this.prisma.oneTimeCode.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      });
      await this.recordFailedLogin(destination, 'TOO_MANY_ATTEMPTS', context);
      throw new TooManyRequestsError('Superaste los intentos. Pedí un código nuevo.');
    }

    if (!this.tokens.verifyOtpCode(code, destination, record.codeHash)) {
      await this.prisma.oneTimeCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      await this.recordFailedLogin(destination, 'CODE_MISMATCH', context);
      throw new UnprocessableError(
        'AUTH_CODE_INVALID',
        'El código no es válido o venció. Pedí uno nuevo.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.oneTimeCode.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      });

      const user = await this.findOrCreateUser(tx, destination);
      const session = await this.openSession(tx, user.id, context);

      await this.audit.record(tx, {
        action: AuditAction.LOGIN_SUCCEEDED,
        entityType: 'User',
        entityId: user.id,
        actor: {
          userId: user.id,
          role: PlatformRole.SYSTEM,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        after: { sessionId: session.sessionId, method: 'EMAIL_OTP' },
        correlationId: context.correlationId,
      });

      return session;
    });
  }

  /**
   * Renueva la sesión rotando el refresh token.
   *
   * Si llega un token que ya fue consumido, se invalida **toda la familia** de
   * tokens de esa sesión: es la señal clásica de un token robado, y cerrar la
   * sesión entera es preferible a dejar conviviendo al legítimo con el atacante
   * (docs/security-model.md §2).
   */
  async refresh(refreshToken: string, context: RequestContext): Promise<IssuedSession> {
    const tokenHash = this.tokens.hashOpaqueToken(refreshToken);
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: tokenHash },
    });

    if (session === null) {
      throw new AppError('AUTH_REFRESH_INVALID', 'Tu sesión no es válida.', 401);
    }

    if (session.revokedAt !== null) {
      await this.prisma.$transaction(async (tx) => {
        await tx.session.updateMany({
          where: { tokenFamilyId: session.tokenFamilyId, revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: 'REFRESH_TOKEN_REUSE_DETECTED' },
        });
        await this.audit.record(tx, {
          action: AuditAction.SESSION_REUSE_DETECTED,
          entityType: 'Session',
          entityId: session.id,
          actor: {
            userId: session.userId,
            role: PlatformRole.SYSTEM,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
          after: { tokenFamilyId: session.tokenFamilyId },
          correlationId: context.correlationId,
        });
      });

      throw new AppError(
        'AUTH_REFRESH_REUSED',
        'Detectamos un uso indebido de la sesión. Volvé a ingresar.',
        401,
      );
    }

    if (session.expiresAt < new Date()) {
      throw new AppError('AUTH_REFRESH_EXPIRED', 'Tu sesión venció. Volvé a ingresar.', 401);
    }

    return this.prisma.$transaction(async (tx) => {
      // El token viejo se marca revocado, no se borra: si vuelve a aparecer,
      // el bloque de arriba lo detecta como reutilización.
      await tx.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date(), revokedReason: 'ROTATED' },
      });

      const rotated = await this.openSession(tx, session.userId, context, session.tokenFamilyId);

      await this.audit.record(tx, {
        action: AuditAction.SESSION_REFRESHED,
        entityType: 'Session',
        entityId: rotated.sessionId,
        actor: {
          userId: session.userId,
          role: PlatformRole.SYSTEM,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        after: { previousSessionId: session.id },
        correlationId: context.correlationId,
      });

      return rotated;
    });
  }

  async logout(sessionId: string, userId: string, context: RequestContext): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.session.updateMany({
        where: { id: sessionId, userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'USER_LOGOUT' },
      });
      await this.audit.record(tx, {
        action: AuditAction.SESSION_REVOKED,
        entityType: 'Session',
        entityId: sessionId,
        actor: {
          userId,
          role: PlatformRole.SYSTEM,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        after: { reason: 'USER_LOGOUT' },
        correlationId: context.correlationId,
      });
    });
  }

  /** Emite un access token nuevo con los roles y perfiles actuales del usuario. */
  async issueAccessTokenFor(userId: string, sessionId: string): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        roles: { where: { revokedAt: null } },
        employerProfile: true,
        workerProfile: true,
      },
    });

    return this.accessTokens.sign({
      sub: user.id,
      sid: sessionId,
      roles: user.roles.map((r) => r.role),
      emp: user.employerProfile?.id ?? null,
      wrk: user.workerProfile?.id ?? null,
    });
  }

  // ─── Auxiliares ────────────────────────────────────────────────────────────

  private async findOrCreateUser(tx: PrismaTx, email: string): Promise<{ id: string }> {
    const existing = await tx.user.findUnique({ where: { email } });
    if (existing !== null) {
      if (existing.emailVerifiedAt === null) {
        await tx.user.update({
          where: { id: existing.id },
          data: { emailVerifiedAt: new Date(), status: 'ACTIVE' },
        });
      }
      return existing;
    }

    return tx.user.create({
      data: {
        email,
        // Sin nombre todavía: lo carga al completar el perfil.
        displayName: email.split('@')[0] ?? email,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });
  }

  private async openSession(
    tx: PrismaTx,
    userId: string,
    context: RequestContext,
    tokenFamilyId?: string,
  ): Promise<IssuedSession> {
    const refreshToken = this.tokens.generateOpaqueToken();

    const session = await tx.session.create({
      data: {
        userId,
        refreshTokenHash: this.tokens.hashOpaqueToken(refreshToken),
        tokenFamilyId: tokenFamilyId ?? randomUUID(),
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      },
    });

    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        roles: { where: { revokedAt: null } },
        employerProfile: true,
        workerProfile: true,
      },
    });

    const accessToken = this.accessTokens.sign({
      sub: userId,
      sid: session.id,
      roles: user.roles.map((r) => r.role),
      emp: user.employerProfile?.id ?? null,
      wrk: user.workerProfile?.id ?? null,
    });

    return { accessToken, refreshToken, userId, sessionId: session.id };
  }

  private async recordFailedLogin(
    destination: string,
    reason: string,
    context: RequestContext,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: destination } });
    await this.prisma.$transaction(async (tx) => {
      await this.audit.record(tx, {
        action: AuditAction.LOGIN_FAILED,
        entityType: 'User',
        entityId: user?.id ?? destination,
        actor: {
          userId: user?.id ?? null,
          role: PlatformRole.SYSTEM,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        after: { reason },
        correlationId: context.correlationId,
      });
    });
  }

  /** TTL del access token, para que el controlador no lo redefina. */
  get accessTokenTtlSeconds(): number {
    return ACCESS_TOKEN_TTL_SECONDS;
  }

  get isProduction(): boolean {
    return this.config.NODE_ENV === 'production';
  }
}

export { OTP_MAX_ATTEMPTS, OTP_TTL_MINUTES, OTP_REQUESTS_PER_WINDOW, OTP_PURPOSE };
export type { PrismaClient };
