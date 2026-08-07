import { timingSafeEqual } from 'node:crypto';
import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Optional,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotFoundError } from '../../common/http/app.errors';
import { TokenService } from '../../common/crypto/token.service';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { TestNotificationSink } from '../notifications/test-notification-sink';

/**
 * Apoyo para las pruebas automatizadas (exclusivo para NODE_ENV=test).
 *
 * Entrega directamente el código OTP (obtenido en memoria desde TestNotificationSink,
 * sin almacenar en claro en la BD) y el token de invitación.
 */
@ApiExcludeController()
@Controller('test-support')
export class TestSupportController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    @Optional() private readonly testSink: TestNotificationSink | null,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private assertEnabled(secretHeader?: string): void {
    if (this.config.NODE_ENV !== 'test' || !this.config.FEATURE_TEST_SUPPORT_ENDPOINTS) {
      throw new ForbiddenException({
        code: 'TEST_SUPPORT_DISABLED',
        message: 'Endpoints de prueba sólo disponibles en NODE_ENV=test.',
      });
    }

    const expectedSecret = this.config.TEST_SUPPORT_SECRET;
    if (!expectedSecret || expectedSecret.length < 16) {
      throw new ForbiddenException({
        code: 'TEST_SUPPORT_NOT_CONFIGURED',
        message: 'Secret de test support no configurado.',
      });
    }

    if (!secretHeader || !timingSafeCompare(secretHeader, expectedSecret)) {
      throw new UnauthorizedException({
        code: 'TEST_SUPPORT_UNAUTHORIZED',
        message: 'La cabecera x-test-support-secret es inválida.',
      });
    }
  }

  /** Último código de acceso vigente para un correo (obtenido del sink de notificaciones de prueba). */
  @Public()
  @Get('last-access-code')
  async lastAccessCode(
    @Query('email') email: string,
    @Headers('x-test-support-secret') secretHeader?: string,
  ): Promise<{ code: string }> {
    this.assertEnabled(secretHeader);

    const destination = (email ?? '').toLowerCase();
    const record = await this.prisma.oneTimeCode.findFirst({
      where: { destination, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (record === null) throw new NotFoundError('No hay un código vigente para ese correo.');

    const code = this.testSink?.getLastAccessCode(destination);
    if (!code) {
      throw new NotFoundError('No se pudo recuperar el código desde el sink de prueba.');
    }

    return { code };
  }

  /** Token en claro de una invitación pendiente. */
  @Public()
  @Get('invitation-token')
  async invitationToken(
    @Query('email') email: string,
    @Headers('x-test-support-secret') secretHeader?: string,
  ): Promise<{ token: string }> {
    this.assertEnabled(secretHeader);

    const invitation = await this.prisma.workerInvitation.findFirst({
      where: { workerEmail: (email ?? '').toLowerCase(), status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    if (invitation === null) {
      throw new NotFoundError('No hay una invitación pendiente para ese correo.');
    }

    const token = this.tokens.generateOpaqueToken();
    await this.prisma.workerInvitation.update({
      where: { id: invitation.id },
      data: { tokenHash: this.tokens.hashOpaqueToken(token) },
    });

    return { token };
  }
}

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
