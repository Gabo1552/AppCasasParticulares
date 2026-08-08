import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthStatus, runHealthChecks, type HealthReport } from '@casas/observability';
import { Public } from '../common/auth/auth.types';
import { PrismaService } from '../common/prisma/prisma.service';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { RedisSessionRevocationService } from '../modules/identity/redis-session-revocation.service';

/**
 * Verificaciones de salud (NFR-09).
 *
 * `/health` responde si el proceso está vivo (liveness). `/ready` verifica que las
 * dependencias (Postgres, Redis, Documentos Legales Aprobados en producción)
 * estén alcanzables.
 */
@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionRevocation: RedisSessionRevocationService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Liveness: el proceso está vivo' })
  health(): { status: string; uptimeSeconds: number } {
    return { status: HealthStatus.UP, uptimeSeconds: Math.floor(process.uptime()) };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness: las dependencias están alcanzables' })
  async ready(): Promise<HealthReport> {
    const report = await runHealthChecks({
      postgres: async () => {
        await this.prisma.$queryRaw`SELECT 1`;
        return { status: HealthStatus.UP };
      },
      redis: async () => {
        try {
          await this.sessionRevocation.isSessionRevoked('health-check-ping');
          return { status: HealthStatus.UP };
        } catch (error) {
          return { status: HealthStatus.DOWN, detail: (error as Error).message };
        }
      },
      legalDocuments: async () => {
        if (this.config.NODE_ENV !== 'production') {
          return {
            status: HealthStatus.UP,
            detail: 'Modo desarrollo: documentos borrador autorizados.',
          };
        }

        const terms = await this.prisma.consentDocument.findFirst({
          where: { kind: 'TERMS_OF_SERVICE', version: { contains: 'approved' } },
        });
        const privacy = await this.prisma.consentDocument.findFirst({
          where: { kind: 'PRIVACY_POLICY', version: { contains: 'approved' } },
        });

        if (terms === null || privacy === null) {
          return {
            status: HealthStatus.DOWN,
            detail: 'Faltan documentos legales aprobados (APPROVED) para producción.',
          };
        }

        return { status: HealthStatus.UP };
      },
    });

    if (report.status === HealthStatus.DOWN) {
      throw new ServiceUnavailableException(report);
    }

    return report;
  }
}
