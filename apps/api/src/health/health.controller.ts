import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthStatus, runHealthChecks, type HealthReport } from '@casas/observability';

/**
 * Verificaciones de salud (NFR-09).
 *
 * `/health` responde si el proceso está vivo. `/ready` verifica que las
 * dependencias estén alcanzables: un proceso vivo pero sin base de datos no debe
 * recibir tráfico, y el orquestador necesita poder distinguir esos dos estados.
 */
@ApiTags('health')
@Controller()
export class HealthController {
  @Get('health')
  @ApiOperation({ summary: 'Liveness: el proceso está vivo' })
  health(): { status: string; uptimeSeconds: number } {
    return { status: HealthStatus.UP, uptimeSeconds: Math.floor(process.uptime()) };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness: las dependencias están alcanzables' })
  async ready(): Promise<HealthReport> {
    // Las verificaciones concretas de Postgres, Redis y storage se conectan en la
    // Etapa 3, cuando existan los clientes. La estructura ya está para que agregar
    // una sea una línea, no un refactor.
    return runHealthChecks({});
  }
}
