import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  AttendanceCorrectionStatus,
  ClockInMethod,
  PlatformRole,
  TimeEntryKind,
  TimeEntryStatus,
  WorkDayStatus,
} from '@casas/database';
import { ResourceVersionConflictError } from '@casas/domain';
import type {
  AttendanceView,
  RequestAttendanceCorrectionInput,
  ResolveAttendanceCorrectionInput,
} from '@casas/contracts';
import { AuditAction, AuditService } from '../../common/audit/audit.service';
import { PrismaService, type PrismaTx } from '../../common/prisma/prisma.service';
import { ForbiddenError, NotFoundError, UnprocessableError } from '../../common/http/app.errors';
import type { AuthenticatedActor } from '../../common/auth/auth.types';
import { OutboxNotificationService } from '../notifications/outbox-notification.service';
import { toAttendanceView } from '../time-tracking/time-tracking.service';

const FULL_WORKDAY_INCLUDE = {
  relationship: {
    include: {
      employer: {
        include: {
          user: { select: { email: true } },
        },
      },
      worker: {
        include: {
          user: { select: { email: true } },
        },
      },
      household: { select: { id: true, label: true, city: true, timezone: true } },
    },
  },
  timeEntries: {
    orderBy: { declaredAt: 'asc' as const },
  },
  corrections: {
    orderBy: { createdAt: 'desc' as const },
  },
} as const;

@Injectable()
export class AttendanceCorrectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxNotificationService,
  ) {}

  /**
   * Solicitar una corrección de jornada (trabajadora o familia).
   */
  async requestCorrection(
    actor: AuthenticatedActor,
    attendanceId: string,
    input: RequestAttendanceCorrectionInput,
  ): Promise<AttendanceView> {
    const workDay = await this.prisma.workDay.findUnique({
      where: { id: attendanceId },
      include: FULL_WORKDAY_INCLUDE,
    });

    if (workDay === null) {
      throw new NotFoundError('Jornada no encontrada.');
    }

    const isEmployer = workDay.relationship.employer.userId === actor.userId;
    const isWorker = workDay.relationship.worker?.userId === actor.userId;

    if (!isEmployer && !isWorker) {
      throw new NotFoundError('Jornada no encontrada.');
    }

    if (workDay.version !== input.expectedVersion) {
      throw new ResourceVersionConflictError(
        'La jornada cambió mientras la estabas revisando. Actualizamos la información para que puedas revisarla nuevamente.',
      );
    }

    const pendingCorrection = workDay.corrections.find(
      (c) => c.status === AttendanceCorrectionStatus.PENDING,
    );
    if (pendingCorrection !== undefined) {
      throw new UnprocessableError(
        'CORRECTION_ALREADY_PENDING',
        'Ya existe una solicitud de corrección pendiente de resolución para esta jornada.',
      );
    }

    const clockInEntry = workDay.timeEntries.find(
      (e) => e.kind === TimeEntryKind.CLOCK_IN && e.status !== TimeEntryStatus.CORRECTED,
    );
    const clockOutEntry = workDay.timeEntries.find(
      (e) => e.kind === TimeEntryKind.CLOCK_OUT && e.status !== TimeEntryStatus.CORRECTED,
    );

    const proposedClockInAt = new Date(input.proposedClockInAt);
    const proposedClockOutAt = new Date(input.proposedClockOutAt);

    if (proposedClockOutAt <= proposedClockInAt) {
      throw new UnprocessableError(
        'INVALID_PROPOSED_TIMES',
        'La hora de salida propuesta debe ser posterior a la de entrada.',
      );
    }

    const resultWorkDay = await this.prisma.$transaction(async (tx: PrismaTx) => {
      const updateResult = await tx.workDay.updateMany({
        where: {
          id: workDay.id,
          version: input.expectedVersion,
        },
        data: {
          status: WorkDayStatus.DISPUTED,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new ResourceVersionConflictError(
          'La jornada cambió mientras la estabas revisando. Actualizamos la información para que puedas revisarla nuevamente.',
        );
      }

      const correction = await tx.attendanceCorrection.create({
        data: {
          workDayId: workDay.id,
          status: AttendanceCorrectionStatus.PENDING,
          requestedByUserId: actor.userId,
          reason: input.reason,
          originalClockInAt: clockInEntry?.declaredAt ?? null,
          originalClockOutAt: clockOutEntry?.declaredAt ?? null,
          proposedClockInAt,
          proposedClockOutAt,
        },
      });

      await this.audit.record(tx, {
        action: AuditAction.ATTENDANCE_CORRECTION_REQUESTED,
        entityType: 'AttendanceCorrection',
        entityId: correction.id,
        actor: {
          userId: actor.userId,
          role: actor.roles[0] ?? PlatformRole.WORKER,
        },
        after: {
          workDayId: workDay.id,
          reason: input.reason,
          proposedClockInAt: proposedClockInAt.toISOString(),
          proposedClockOutAt: proposedClockOutAt.toISOString(),
        },
      });

      const recipientEmail = isWorker
        ? workDay.relationship.employer.user.email
        : workDay.relationship.worker?.user.email;

      if (recipientEmail) {
        await this.outbox.enqueueEmail(tx, {
          to: recipientEmail,
          subject: 'Solicitud de corrección de jornada',
          text: `Se solicitó una corrección para la jornada del ${workDay.date.toISOString().slice(0, 10)}. Motivo: ${input.reason}`,
        });
      }

      return tx.workDay.findUniqueOrThrow({
        where: { id: workDay.id },
        include: FULL_WORKDAY_INCLUDE,
      });
    });

    return toAttendanceView(resultWorkDay);
  }

  /**
   * Aprobar una corrección de jornada (sólo la familia empleadora).
   */
  async approveCorrection(
    actor: AuthenticatedActor,
    attendanceId: string,
    correctionId: string,
    expectedVersion: number,
  ): Promise<AttendanceView> {
    const workDay = await this.prisma.workDay.findUnique({
      where: { id: attendanceId },
      include: FULL_WORKDAY_INCLUDE,
    });

    if (workDay === null) {
      throw new NotFoundError('Jornada no encontrada.');
    }

    const isEmployer = workDay.relationship.employer.userId === actor.userId;
    const isWorker = workDay.relationship.worker?.userId === actor.userId;

    if (!isEmployer && !isWorker) {
      throw new NotFoundError('Jornada no encontrada.');
    }

    if (!isEmployer) {
      throw new ForbiddenError(
        'Sólo la familia empleadora titular puede aprobar correcciones de jornada.',
      );
    }

    if (workDay.version !== expectedVersion) {
      throw new ResourceVersionConflictError(
        'La jornada cambió mientras la estabas revisando. Actualizamos la información para que puedas revisarla nuevamente.',
      );
    }

    const correction = workDay.corrections.find((c) => c.id === correctionId);
    if (correction === undefined) {
      throw new NotFoundError('Solicitud de corrección no encontrada.');
    }

    if (correction.status !== AttendanceCorrectionStatus.PENDING) {
      throw new UnprocessableError(
        'CORRECTION_NOT_PENDING',
        'La solicitud de corrección ya fue resuelta previamente.',
      );
    }

    if (!correction.proposedClockInAt || !correction.proposedClockOutAt) {
      throw new UnprocessableError(
        'INCOMPLETE_CORRECTION',
        'La corrección no contiene horarios propuestos válidos.',
      );
    }

    const realMinutes = Math.max(
      0,
      Math.floor(
        (correction.proposedClockOutAt.getTime() - correction.proposedClockInAt.getTime()) / 60000,
      ),
    );
    const computableMinutes = Math.max(0, realMinutes - (workDay.breakMinutes ?? 0));
    const approvedMinutes = realMinutes;
    const timezone = workDay.relationship.household.timezone ?? 'America/Argentina/Buenos_Aires';

    const resultWorkDay = await this.prisma.$transaction(async (tx: PrismaTx) => {
      const updateResult = await tx.workDay.updateMany({
        where: {
          id: workDay.id,
          status: WorkDayStatus.DISPUTED,
          version: expectedVersion,
        },
        data: {
          status: WorkDayStatus.APPROVED,
          realMinutes,
          computableMinutes,
          approvedMinutes,
          approvedAt: new Date(),
          approvedByUserId: actor.userId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new ResourceVersionConflictError(
          'La jornada cambió mientras la estabas revisando. Actualizamos la información para que puedas revisarla nuevamente.',
        );
      }

      await tx.attendanceCorrection.update({
        where: { id: correctionId },
        data: {
          status: AttendanceCorrectionStatus.APPROVED,
          resolvedAt: new Date(),
          resolvedByUserId: actor.userId,
          version: { increment: 1 },
        },
      });

      // Archivar fichajes anteriores como CORRECTED
      await tx.timeEntry.updateMany({
        where: {
          workDayId: workDay.id,
          status: {
            in: [
              TimeEntryStatus.RECORDED,
              TimeEntryStatus.PENDING_APPROVAL,
              TimeEntryStatus.APPROVED,
              TimeEntryStatus.DISPUTED,
            ],
          },
        },
        data: {
          status: TimeEntryStatus.CORRECTED,
        },
      });

      const oldClockIn = workDay.timeEntries.find((e) => e.kind === TimeEntryKind.CLOCK_IN);
      const oldClockOut = workDay.timeEntries.find((e) => e.kind === TimeEntryKind.CLOCK_OUT);

      // Crear nuevos registros de fichaje aprobados que corrigen los originales
      await tx.timeEntry.create({
        data: {
          employmentRelationshipId: workDay.employmentRelationshipId,
          workDayId: workDay.id,
          kind: TimeEntryKind.CLOCK_IN,
          status: TimeEntryStatus.APPROVED,
          declaredAt: correction.proposedClockInAt!,
          receivedAt: new Date(),
          timezone,
          method: ClockInMethod.MANUAL,
          clientIdempotencyKey: randomUUID(),
          correctsTimeEntryId: oldClockIn?.id ?? null,
          note: `Corrección aprobada: ${correction.reason}`,
          createdByUserId: actor.userId,
        },
      });

      await tx.timeEntry.create({
        data: {
          employmentRelationshipId: workDay.employmentRelationshipId,
          workDayId: workDay.id,
          kind: TimeEntryKind.CLOCK_OUT,
          status: TimeEntryStatus.APPROVED,
          declaredAt: correction.proposedClockOutAt!,
          receivedAt: new Date(),
          timezone,
          method: ClockInMethod.MANUAL,
          clientIdempotencyKey: randomUUID(),
          correctsTimeEntryId: oldClockOut?.id ?? null,
          note: `Corrección aprobada: ${correction.reason}`,
          createdByUserId: actor.userId,
        },
      });

      await this.audit.record(tx, {
        action: AuditAction.ATTENDANCE_CORRECTION_APPROVED,
        entityType: 'AttendanceCorrection',
        entityId: correctionId,
        actor: {
          userId: actor.userId,
          role: actor.roles[0] ?? PlatformRole.FAMILY_EMPLOYER,
        },
        after: {
          correctionId,
          workDayId: workDay.id,
          approvedMinutes,
          proposedClockInAt: correction.proposedClockInAt!.toISOString(),
          proposedClockOutAt: correction.proposedClockOutAt!.toISOString(),
        },
      });

      if (workDay.relationship.worker?.user.email) {
        await this.outbox.enqueueEmail(tx, {
          to: workDay.relationship.worker.user.email,
          subject: 'Corrección de jornada aprobada',
          text: `La familia empleadora aprobó la corrección solicitada para la jornada del ${workDay.date.toISOString().slice(0, 10)}.`,
        });
      }

      return tx.workDay.findUniqueOrThrow({
        where: { id: workDay.id },
        include: FULL_WORKDAY_INCLUDE,
      });
    });

    return toAttendanceView(resultWorkDay);
  }

  /**
   * Rechazar una corrección de jornada (sólo la familia empleadora).
   */
  async rejectCorrection(
    actor: AuthenticatedActor,
    attendanceId: string,
    correctionId: string,
    input: ResolveAttendanceCorrectionInput,
  ): Promise<AttendanceView> {
    const workDay = await this.prisma.workDay.findUnique({
      where: { id: attendanceId },
      include: FULL_WORKDAY_INCLUDE,
    });

    if (workDay === null) {
      throw new NotFoundError('Jornada no encontrada.');
    }

    const isEmployer = workDay.relationship.employer.userId === actor.userId;
    const isWorker = workDay.relationship.worker?.userId === actor.userId;

    if (!isEmployer && !isWorker) {
      throw new NotFoundError('Jornada no encontrada.');
    }

    if (!isEmployer) {
      throw new ForbiddenError(
        'Sólo la familia empleadora titular puede rechazar correcciones de jornada.',
      );
    }

    if (workDay.version !== input.expectedVersion) {
      throw new ResourceVersionConflictError(
        'La jornada cambió mientras la estabas revisando. Actualizamos la información para que puedas revisarla nuevamente.',
      );
    }

    const correction = workDay.corrections.find((c) => c.id === correctionId);
    if (correction === undefined) {
      throw new NotFoundError('Solicitud de corrección no encontrada.');
    }

    if (correction.status !== AttendanceCorrectionStatus.PENDING) {
      throw new UnprocessableError(
        'CORRECTION_NOT_PENDING',
        'La solicitud de corrección ya fue resuelta previamente.',
      );
    }

    const hasClockOut = workDay.timeEntries.some((e) => e.kind === TimeEntryKind.CLOCK_OUT);
    const targetStatus = hasClockOut ? WorkDayStatus.PENDING_APPROVAL : WorkDayStatus.OPEN;

    const resultWorkDay = await this.prisma.$transaction(async (tx: PrismaTx) => {
      const updateResult = await tx.workDay.updateMany({
        where: {
          id: workDay.id,
          status: WorkDayStatus.DISPUTED,
          version: input.expectedVersion,
        },
        data: {
          status: targetStatus,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new ResourceVersionConflictError(
          'La jornada cambió mientras la estabas revisando. Actualizamos la información para que puedas revisarla nuevamente.',
        );
      }

      await tx.attendanceCorrection.update({
        where: { id: correctionId },
        data: {
          status: AttendanceCorrectionStatus.REJECTED,
          resolvedAt: new Date(),
          resolvedByUserId: actor.userId,
          resolutionNote: input.reason ?? null,
          version: { increment: 1 },
        },
      });

      await this.audit.record(tx, {
        action: AuditAction.ATTENDANCE_CORRECTION_REJECTED,
        entityType: 'AttendanceCorrection',
        entityId: correctionId,
        actor: {
          userId: actor.userId,
          role: actor.roles[0] ?? PlatformRole.FAMILY_EMPLOYER,
        },
        after: {
          correctionId,
          workDayId: workDay.id,
          resolutionNote: input.reason ?? null,
        },
      });

      if (workDay.relationship.worker?.user.email) {
        await this.outbox.enqueueEmail(tx, {
          to: workDay.relationship.worker.user.email,
          subject: 'Corrección de jornada rechazada',
          text: `La familia empleadora no aceptó la corrección solicitada para la jornada del ${workDay.date.toISOString().slice(0, 10)}.${input.reason ? ` Motivo: ${input.reason}` : ''}`,
        });
      }

      return tx.workDay.findUniqueOrThrow({
        where: { id: workDay.id },
        include: FULL_WORKDAY_INCLUDE,
      });
    });

    return toAttendanceView(resultWorkDay);
  }
}
