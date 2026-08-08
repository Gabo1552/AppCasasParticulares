import { Body, Controller, Delete, Get, Inject, Param, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { getCorrelationId } from '@casas/observability';
import { requestCodeSchema, verifyCodeSchema } from '@casas/contracts';
import type { Response } from 'express';
import {
  Actor,
  Public,
  type AuthenticatedActor,
  type RequestWithActor,
} from '../../common/auth/auth.types';
import {
  REFRESH_TOKEN_COOKIE,
  clearSessionCookies,
  setSessionCookies,
} from '../../common/auth/cookies';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { AppError } from '../../common/http/app.errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { IdentityService, type RequestContext } from './identity.service';
import { InvitationsService } from '../employment-relationships/invitations.service';

@ApiTags('auth')
@Controller('auth')
export class IdentityController {
  constructor(
    private readonly identity: IdentityService,
    private readonly invitations: InvitationsService,
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Post('request-code')
  @ApiOperation({ summary: 'Envía un código de un solo uso al correo' })
  async requestCode(
    @Body(new ZodValidationPipe(requestCodeSchema)) body: { email: string },
    @Req() request: RequestWithActor,
  ): Promise<{ ok: true }> {
    await this.identity.requestCode(body.email, contextOf(request));
    // Respuesta idéntica exista o no el correo: no se puede enumerar usuarios.
    return { ok: true };
  }

  @Public()
  @Post('verify-code')
  @ApiOperation({ summary: 'Valida el código y abre sesión' })
  async verifyCode(
    @Body(new ZodValidationPipe(verifyCodeSchema))
    body: { email: string; code: string; invitationToken?: string },
    @Req() request: RequestWithActor,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ userId: string; csrfToken: string }> {
    const session = await this.identity.verifyCode(body.email, body.code, contextOf(request));
    const csrfToken = setSessionCookies(response, this.config, session);

    return { userId: session.userId, csrfToken };
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Rota el refresh token y renueva la sesión' })
  async refresh(
    @Req() request: RequestWithActor,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ csrfToken: string }> {
    const cookies = request.cookies as Record<string, string> | undefined;
    const refreshToken = cookies?.[REFRESH_TOKEN_COOKIE] ?? extractBodyRefreshToken(request);

    if (refreshToken === undefined) {
      throw new AppError('AUTH_REFRESH_MISSING', 'No hay una sesión para renovar.', 401);
    }

    const session = await this.identity.refresh(refreshToken, contextOf(request));
    const csrfToken = setSessionCookies(response, this.config, session);

    return { csrfToken };
  }

  @Post('logout')
  @ApiOperation({ summary: 'Cierra la sesión actual' })
  async logout(
    @Actor() actor: AuthenticatedActor,
    @Req() request: RequestWithActor,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ ok: true }> {
    await this.identity.logout(actor.sessionId, actor.userId, contextOf(request));
    clearSessionCookies(response, this.config);
    return { ok: true };
  }

  @Post('logout-all')
  @ApiOperation({ summary: 'Cierra todas las sesiones activas del usuario' })
  async logoutAll(
    @Actor() actor: AuthenticatedActor,
    @Req() request: RequestWithActor,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ ok: true }> {
    await this.identity.logoutAll(actor.userId, contextOf(request));
    clearSessionCookies(response, this.config);
    return { ok: true };
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Lista las sesiones activas e históricas del usuario' })
  listSessions(@Actor() actor: AuthenticatedActor) {
    return this.identity.listSessions(actor.userId, actor.sessionId);
  }

  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Revoca una sesión específica del usuario' })
  async revokeSession(
    @Actor() actor: AuthenticatedActor,
    @Param('id') id: string,
    @Req() request: RequestWithActor,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ ok: true }> {
    await this.identity.revokeSessionById(id, actor.userId, contextOf(request));
    if (id === actor.sessionId) {
      clearSessionCookies(response, this.config);
    }
    return { ok: true };
  }

  @Get('me')
  @ApiOperation({ summary: 'Devuelve el usuario, sus roles y su próximo paso' })
  async me(@Actor() actor: AuthenticatedActor): Promise<MeResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.userId },
      include: {
        roles: { where: { revokedAt: null } },
        employerProfile: true,
        workerProfile: true,
      },
    });

    const pendingInvitations = await this.invitations.countPendingFor(user.email ?? '');

    return {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      timezone: user.timezone,
      roles: user.roles.map((r) => r.role),
      employer:
        user.employerProfile === null
          ? null
          : {
              id: user.employerProfile.id,
              firstName: user.employerProfile.firstName,
              lastName: user.employerProfile.lastName,
            },
      worker:
        user.workerProfile === null
          ? null
          : {
              id: user.workerProfile.id,
              firstName: user.workerProfile.firstName,
              lastName: user.workerProfile.lastName,
            },
      pendingInvitations,
    };
  }
}

export interface MeResponse {
  userId: string;
  email: string | null;
  displayName: string;
  timezone: string;
  roles: string[];
  employer: { id: string; firstName: string; lastName: string } | null;
  worker: { id: string; firstName: string; lastName: string } | null;
  pendingInvitations: number;
}

function contextOf(request: RequestWithActor): RequestContext {
  return {
    ipAddress: request.ip,
    userAgent: request.get('user-agent'),
    correlationId: getCorrelationId(),
  };
}

/** Permite renovar sin cookies (app móvil, pruebas de integración). */
function extractBodyRefreshToken(request: RequestWithActor): string | undefined {
  const body = request.body as { refreshToken?: unknown } | undefined;
  return typeof body?.refreshToken === 'string' ? body.refreshToken : undefined;
}
