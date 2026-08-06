import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthStatus, runHealthChecks, type HealthReport } from '@casas/observability';
import { Public } from '../common/auth/auth.types';

/**
 * Verificaciones de salud (NFR-09).
 *
 * `/health` responde si el proceso está vivo. `/ready` verifica que las
 * dependencias estén alcanzables: un proceso vivo pero sin base de datos no debe
 * recibir tráfico, y el orquestador necesita poder distinguir esos dos estados.
 *
 * Las dos son públicas. El guard de sesión es global, así que sin `@Public` el
 * sondeo del orquestador recibiría 401 y daría por caído un proceso sano. No
 * exponen nada sensible: un estado y el tiempo encendido.
 */
@ApiTags('health')
@Controller()
export class HealthController {
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
    // Las verificaciones concretas de Postgres, Redis y storage se conectan en la
    // Etapa 3, cuando existan los clientes. La estructura ya está para que agregar
    // una sea una línea, no un refactor.
    return runHealthChecks({});
  }
}
