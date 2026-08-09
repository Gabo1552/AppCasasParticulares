import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformRole } from '@casas/database';
import {
  approveAttendanceSchema,
  attendanceListQuerySchema,
  clockInRequestSchema,
  clockOutRequestSchema,
  type ApproveAttendanceRequest,
  type AttendanceListQuery,
  type AttendanceView,
  type ClockInRequest,
  type ClockOutRequest,
} from '@casas/contracts';
import { Actor, Roles, type AuthenticatedActor } from '../../common/auth/auth.types';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { TimeTrackingService } from './time-tracking.service';

@ApiTags('attendance')
@Controller()
export class TimeTrackingController {
  constructor(private readonly timeTracking: TimeTrackingService) {}

  @Post('employment-relationships/:relationshipId/attendance/clock-in')
  @Roles(PlatformRole.WORKER)
  @ApiOperation({ summary: 'Ficha entrada (clock-in) de la trabajadora en la relación activa' })
  clockIn(
    @Actor() actor: AuthenticatedActor,
    @Param('relationshipId', ParseUUIDPipe) relationshipId: string,
    @Body(new ZodValidationPipe(clockInRequestSchema)) body: ClockInRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<AttendanceView> {
    return this.timeTracking.clockIn(actor, relationshipId, body, idempotencyKey);
  }

  @Post('attendance/:attendanceId/clock-out')
  @Roles(PlatformRole.WORKER)
  @ApiOperation({
    summary: 'Ficha salida (clock-out) de la trabajadora cerrando la jornada abierta',
  })
  clockOut(
    @Actor() actor: AuthenticatedActor,
    @Param('attendanceId', ParseUUIDPipe) attendanceId: string,
    @Body(new ZodValidationPipe(clockOutRequestSchema)) body: ClockOutRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<AttendanceView> {
    return this.timeTracking.clockOut(actor, attendanceId, body, idempotencyKey);
  }

  @Get('employment-relationships/:relationshipId/attendance')
  @ApiOperation({ summary: 'Lista las jornadas registradas de una relación laboral' })
  list(
    @Actor() actor: AuthenticatedActor,
    @Param('relationshipId', ParseUUIDPipe) relationshipId: string,
    @Query(new ZodValidationPipe(attendanceListQuerySchema)) query: AttendanceListQuery,
  ): Promise<AttendanceView[]> {
    return this.timeTracking.list(actor, relationshipId, query);
  }

  @Get('attendance/:attendanceId')
  @ApiOperation({ summary: 'Obtiene el detalle completo de una jornada' })
  getById(
    @Actor() actor: AuthenticatedActor,
    @Param('attendanceId', ParseUUIDPipe) attendanceId: string,
  ): Promise<AttendanceView> {
    return this.timeTracking.getById(actor, attendanceId);
  }

  @Post('attendance/:attendanceId/approve')
  @Roles(PlatformRole.FAMILY_EMPLOYER)
  @ApiOperation({ summary: 'La familia empleadora aprueba la jornada pendiente de revisión' })
  approve(
    @Actor() actor: AuthenticatedActor,
    @Param('attendanceId', ParseUUIDPipe) attendanceId: string,
    @Body(new ZodValidationPipe(approveAttendanceSchema)) body: ApproveAttendanceRequest,
  ): Promise<AttendanceView> {
    return this.timeTracking.approve(actor, attendanceId, body);
  }
}
