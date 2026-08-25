import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformRole } from '@casas/database';
import type { PayrollCalculationView } from '@casas/contracts';
import { Actor, Roles, type AuthenticatedActor } from '../../common/auth/auth.types';
import { PayrollCalculationsService } from './payroll-calculations.service';

@ApiTags('payroll')
@Controller()
export class PayrollCalculationsController {
  constructor(private readonly calculations: PayrollCalculationsService) {}

  @Post('periods/:id/calculate')
  @Roles(PlatformRole.FAMILY_EMPLOYER)
  @ApiOperation({
    summary: 'Calcula la preliquidación del período con la versión de parámetros que rige su rango',
  })
  calculate(
    @Actor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) periodId: string,
  ): Promise<PayrollCalculationView> {
    return this.calculations.calculate(actor, periodId);
  }

  /**
   * Sin `@Roles`: la trabajadora también tiene que poder ver el detalle de lo que
   * se calculó sobre su trabajo. Quién participa de la relación lo resuelve el
   * servicio, que responde 404 a quien no pertenece.
   */
  @Get('periods/:id/calculation')
  @ApiOperation({ summary: 'Devuelve la preliquidación vigente del período con sus conceptos' })
  getCurrent(
    @Actor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) periodId: string,
  ): Promise<PayrollCalculationView> {
    return this.calculations.getCurrent(actor, periodId);
  }
}
