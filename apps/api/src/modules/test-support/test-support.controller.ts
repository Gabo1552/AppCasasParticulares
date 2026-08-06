import { Controller, ForbiddenException, Get, Inject, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotFoundError } from '../../common/http/app.errors';
import { TokenService } from '../../common/crypto/token.service';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';

/**
 * Apoyo para las pruebas automatizadas.
 *
 * El E2E necesita el código de acceso y el enlace de invitación sin leer un
 * buzón: parsear correos haría la prueba lenta y frágil. Este controlador los
 * entrega directamente.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  ES UNA PUERTA SIN AUTENTICACIÓN. NO PUEDE EXISTIR EN PRODUCCIÓN.
 *
 *  Tres barreras independientes, porque una sola variable mal puesta no puede
 *  ser lo único que separe esto de una filtración de códigos de acceso:
 *
 *   1. `loadAppConfig` rechaza el arranque si FEATURE_TEST_SUPPORT_ENDPOINTS
 *      llega en `true` con NODE_ENV=production.
 *   2. El módulo sólo se registra si el flag está encendido.
 *   3. Cada handler vuelve a verificar el entorno en tiempo de ejecución.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Además, no devuelve nada arbitrario: sólo el último código de un correo
 * concreto y el token de una invitación concreta. No lista usuarios ni permite
 * recorrer la base.
 */
@ApiExcludeController()
@Controller('test-support')
export class TestSupportController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private assertEnabled(): void {
    if (this.config.NODE_ENV === 'production' || !this.config.FEATURE_TEST_SUPPORT_ENDPOINTS) {
      throw new ForbiddenException({
        code: 'TEST_SUPPORT_DISABLED',
        message: 'No disponible.',
      });
    }
  }

  /** Último código de acceso vigente para un correo. */
  @Public()
  @Get('last-access-code')
  async lastAccessCode(@Query('email') email: string): Promise<{ code: string }> {
    this.assertEnabled();

    const destination = (email ?? '').toLowerCase();
    const record = await this.prisma.oneTimeCode.findFirst({
      where: { destination, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (record === null) throw new NotFoundError('No hay un código vigente para ese correo.');

    // El código está hasheado: no se puede revertir. Se prueban los 10^6
    // valores contra el HMAC, que en local tarda menos de un segundo. Es
    // deliberado que el sistema no pueda devolver el código sin fuerza bruta:
    // significa que la base realmente no lo guarda en claro.
    for (let candidate = 0; candidate < 1_000_000; candidate += 1) {
      const code = String(candidate).padStart(6, '0');
      if (this.tokens.verifyOtpCode(code, destination, record.codeHash)) {
        return { code };
      }
    }
    throw new NotFoundError('No se pudo resolver el código.');
  }

  /**
   * Token en claro de una invitación pendiente.
   *
   * Acá no hay fuerza bruta posible —el token tiene 256 bits— así que se emite
   * uno nuevo y se reemplaza el hash, igual que hace un reenvío.
   */
  @Public()
  @Get('invitation-token')
  async invitationToken(@Query('email') email: string): Promise<{ token: string }> {
    this.assertEnabled();

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
