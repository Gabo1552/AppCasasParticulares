import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformRole } from '@casas/database';
import {
  closeAttendancePeriodRequestSchema,
  createMonthlyPeriodRequestSchema,
  type CloseAttendancePeriodRequest,
  type CreateMonthlyPeriodRequest,
  type MonthlyPeriodView,
} from '@casas/contracts';
import { Actor, Roles, type AuthenticatedActor } from '../../common/auth/auth.types';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { PayrollPeriodsService } from './payroll-periods.service';

@ApiTags('periods')
@Controller()
export class PayrollPeriodsController {
  constructor(private readonly periods: PayrollPeriodsService) {}

  @Post('employment-relationships/:relationshipId/periods')
  @ApiOperation({
    summary: 'Crea o recupera de forma idempotente el período mensual para la relación laboral',
  })
  getOrCreate(
    @Actor() actor: AuthenticatedActor,
    @Param('relationshipId', ParseUUIDPipe) relationshipId: string,
    @Body(new ZodValidationPipe(createMonthlyPeriodRequestSchema)) body: CreateMonthlyPeriodRequest,
  ): Promise<MonthlyPeriodView> {
    return this.periods.getOrCreate(actor, relationshipId, body);
  }

  @Get('employment-relationships/:relationshipId/periods')
  @ApiOperation({ summary: 'Lista los períodos mensuales de una relación laboral' })
  listByRelationship(
    @Actor() actor: AuthenticatedActor,
    @Param('relationshipId', ParseUUIDPipe) relationshipId: string,
  ): Promise<MonthlyPeriodView[]> {
    return this.periods.listByRelationship(actor, relationshipId);
  }

  @Get('periods/:id')
  @ApiOperation({ summary: 'Obtiene el detalle y estado de un período mensual' })
  getById(
    @Actor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) periodId: string,
  ): Promise<MonthlyPeriodView> {
    return this.periods.getById(actor, periodId);
  }

  @Post('periods/:id/close-attendance')
  @Roles(PlatformRole.FAMILY_EMPLOYER)
  @ApiOperation({
    summary:
      'Cierra la asistencia del período mensual, validando jornadas y persistiendo snapshot inmutable',
  })
  closeAttendance(
    @Actor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) periodId: string,
    @Body(new ZodValidationPipe(closeAttendancePeriodRequestSchema))
    body: CloseAttendancePeriodRequest,
  ): Promise<MonthlyPeriodView> {
    return this.periods.closeAttendance(actor, periodId, body);
  }
}
