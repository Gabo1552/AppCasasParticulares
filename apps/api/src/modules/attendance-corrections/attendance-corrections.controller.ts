import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformRole } from '@casas/database';
import {
  approveAttendanceSchema,
  requestAttendanceCorrectionSchema,
  resolveAttendanceCorrectionSchema,
  type ApproveAttendanceRequest,
  type AttendanceView,
  type RequestAttendanceCorrectionInput,
  type ResolveAttendanceCorrectionInput,
} from '@casas/contracts';
import { Actor, Roles, type AuthenticatedActor } from '../../common/auth/auth.types';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { AttendanceCorrectionsService } from './attendance-corrections.service';

@ApiTags('attendance-corrections')
@Controller('attendance/:attendanceId/corrections')
export class AttendanceCorrectionsController {
  constructor(private readonly corrections: AttendanceCorrectionsService) {}

  @Post()
  @ApiOperation({ summary: 'Solicita una corrección de horario sobre una jornada' })
  requestCorrection(
    @Actor() actor: AuthenticatedActor,
    @Param('attendanceId', ParseUUIDPipe) attendanceId: string,
    @Body(new ZodValidationPipe(requestAttendanceCorrectionSchema))
    body: RequestAttendanceCorrectionInput,
  ): Promise<AttendanceView> {
    return this.corrections.requestCorrection(actor, attendanceId, body);
  }

  @Post(':correctionId/approve')
  @Roles(PlatformRole.FAMILY_EMPLOYER)
  @ApiOperation({ summary: 'La familia aprueba la solicitud de corrección' })
  approveCorrection(
    @Actor() actor: AuthenticatedActor,
    @Param('attendanceId', ParseUUIDPipe) attendanceId: string,
    @Param('correctionId', ParseUUIDPipe) correctionId: string,
    @Body(new ZodValidationPipe(approveAttendanceSchema)) body: ApproveAttendanceRequest,
  ): Promise<AttendanceView> {
    return this.corrections.approveCorrection(
      actor,
      attendanceId,
      correctionId,
      body.expectedVersion,
    );
  }

  @Post(':correctionId/reject')
  @Roles(PlatformRole.FAMILY_EMPLOYER)
  @ApiOperation({ summary: 'La familia rechaza la solicitud de corrección' })
  rejectCorrection(
    @Actor() actor: AuthenticatedActor,
    @Param('attendanceId', ParseUUIDPipe) attendanceId: string,
    @Param('correctionId', ParseUUIDPipe) correctionId: string,
    @Body(new ZodValidationPipe(resolveAttendanceCorrectionSchema))
    body: ResolveAttendanceCorrectionInput,
  ): Promise<AttendanceView> {
    return this.corrections.rejectCorrection(actor, attendanceId, correctionId, body);
  }
}
