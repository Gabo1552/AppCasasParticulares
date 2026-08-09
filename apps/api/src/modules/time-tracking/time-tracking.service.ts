import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  ClockInMethod,
  EmploymentRelationshipStatus,
  PlatformRole,
  TimeEntryKind,
  TimeEntryStatus,
  WorkDayStatus,
  type Prisma,
} from '@casas/database';
import { ResourceVersionConflictError } from '@casas/domain';
import type {
  ApproveAttendanceRequest,
  AttendanceListQuery,
  AttendanceView,
  ClockInRequest,
  ClockOutRequest,
} from '@casas/contracts';
import { AuditAction, AuditService } from '../../common/audit/audit.service';
import { PrismaService, type PrismaTx } from '../../common/prisma/prisma.service';
import { ForbiddenError, NotFoundError, UnprocessableError } from '../../common/http/app.errors';
import type { AuthenticatedActor } from '../../common/auth/auth.types';
import { OutboxNotificationService } from '../notifications/outbox-notification.service';

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

type WorkDayWithDetails = Prisma.WorkDayGetPayload<{
  include: typeof FULL_WORKDAY_INCLUDE;
}>;

export function toAttendanceView(workDay: WorkDayWithDetails): AttendanceView {
  const clockIn = workDay.timeEntries.find(
    (e) => e.kind === TimeEntryKind.CLOCK_IN && e.status !== TimeEntryStatus.CORRECTED,
  );
  const clockOut = workDay.timeEntries.find(
    (e) => e.kind === TimeEntryKind.CLOCK_OUT && e.status !== TimeEntryStatus.CORRECTED,
  );

  const approvedCorrection = workDay.corrections.find((c) => c.status === 'APPROVED');

  const effectiveClockInAt = approvedCorrection?.proposedClockInAt
    ? approvedCorrection.proposedClockInAt.toISOString()
    : clockIn?.declaredAt
      ? clockIn.declaredAt.toISOString()
      : null;

  const effectiveClockOutAt = approvedCorrection?.proposedClockOutAt
    ? approvedCorrection.proposedClockOutAt.toISOString()
    : clockOut?.declaredAt
      ? clockOut.declaredAt.toISOString()
      : null;

  return {
    id: workDay.id,
    relationshipId: workDay.employmentRelationshipId,
    date: workDay.date.toISOString().slice(0, 10),
    status: workDay.status,
    clockInAt: clockIn?.declaredAt ? clockIn.declaredAt.toISOString() : null,
    clockOutAt: clockOut?.declaredAt ? clockOut.declaredAt.toISOString() : null,
    effectiveClockInAt,
    effectiveClockOutAt,
    realMinutes: workDay.realMinutes,
    computableMinutes: workDay.computableMinutes,
    approvedMinutes: workDay.approvedMinutes,
    breakMinutes: workDay.breakMinutes,
    approvedAt: workDay.approvedAt ? workDay.approvedAt.toISOString() : null,
    approvedByUserId: workDay.approvedByUserId,
    entries: workDay.timeEntries.map((e) => ({
      id: e.id,
      kind: e.kind,
      status: e.status,
      declaredAt: e.declaredAt.toISOString(),
      receivedAt: e.receivedAt.toISOString(),
      method: e.method,
      note: e.note,
      correctsTimeEntryId: e.correctsTimeEntryId,
    })),
    corrections: workDay.corrections.map((c) => ({
      id: c.id,
      status: c.status,
      requestedByUserId: c.requestedByUserId,
      reason: c.reason,
      originalClockInAt: c.originalClockInAt ? c.originalClockInAt.toISOString() : null,
      originalClockOutAt: c.originalClockOutAt ? c.originalClockOutAt.toISOString() : null,
      proposedClockInAt: c.proposedClockInAt ? c.proposedClockInAt.toISOString() : null,
      proposedClockOutAt: c.proposedClockOutAt ? c.proposedClockOutAt.toISOString() : null,
      resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
      resolvedByUserId: c.resolvedByUserId,
      resolutionNote: c.resolutionNote,
      createdAt: c.createdAt.toISOString(),
      version: c.version ?? 0,
    })),
    version: workDay.version,
    createdAt: workDay.createdAt.toISOString(),
    updatedAt: workDay.updatedAt.toISOString(),
  };
}

@Injectable()
export class TimeTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxNotificationService,
  ) {}

  /**
   * Fichaje de entrada (Clock-In) por la trabajadora.
   */
  async clockIn(
    actor: AuthenticatedActor,
    relationshipId: string,
    input: ClockInRequest,
    idempotencyHeader?: string,
  ): Promise<AttendanceView> {
    const relationship = await this.prisma.employmentRelationship.findUnique({
      where: { id: relationshipId },
      include: {
        worker: { include: { user: true } },
        employer: { include: { user: true } },
        household: true,
      },
    });

    if (relationship === null) {
      throw new NotFoundError('Relación laboral no encontrada.');
    }

    const isWorker = relationship.worker?.userId === actor.userId;
    const isEmployer = relationship.employer?.userId === actor.userId;

    if (!isWorker && !isEmployer) {
      throw new NotFoundError('Relación laboral no encontrada.');
    }

    if (!isWorker) {
      throw new ForbiddenError(
        'Sólo la trabajadora asignada a esta relación puede registrar el fichaje.',
      );
    }

    if (relationship.status !== EmploymentRelationshipStatus.ACTIVE) {
      throw new UnprocessableError(
        'RELATIONSHIP_NOT_ACTIVE',
        'Sólo se puede fichar en relaciones laborales que se encuentren activas.',
      );
    }

    const clientIdempotencyKey = input.clientIdempotencyKey ?? idempotencyHeader ?? randomUUID();

    // Idempotencia: si ya existe este fichaje con la misma clave para la relación, devolverlo.
    const existingEntry = await this.prisma.timeEntry.findUnique({
      where: {
        employmentRelationshipId_clientIdempotencyKey: {
          employmentRelationshipId: relationshipId,
          clientIdempotencyKey,
        },
      },
      include: {
        workDay: {
          include: FULL_WORKDAY_INCLUDE,
        },
      },
    });

    if (existingEntry !== null && existingEntry.workDay !== null) {
      return toAttendanceView(existingEntry.workDay);
    }

    // Autoridad de tiempo del servidor
    const now = new Date();
    const declaredAt = now;
    const receivedAt = now;

    // Timezone oficial del domicilio (fallback 'America/Argentina/Buenos_Aires')
    const timezone = relationship.household.timezone ?? 'America/Argentina/Buenos_Aires';

    // Fecha en hora local del domicilio
    const dateStr = declaredAt.toLocaleDateString('en-CA', { timeZone: timezone });
    const localDate = new Date(`${dateStr}T00:00:00.000Z`);

    const resultWorkDay = await this.prisma.$transaction(async (tx: PrismaTx) => {
      // Si ya existía un fichaje con esta clave de idempotencia en la relación, devolverlo
      if (clientIdempotencyKey) {
        const existingEntryInTx = await tx.timeEntry.findUnique({
          where: {
            employmentRelationshipId_clientIdempotencyKey: {
              employmentRelationshipId: relationshipId,
              clientIdempotencyKey,
            },
          },
        });
        if (existingEntryInTx && existingEntryInTx.workDayId) {
          return tx.workDay.findUniqueOrThrow({
            where: { id: existingEntryInTx.workDayId },
            include: FULL_WORKDAY_INCLUDE,
          });
        }
      }

      // Invariante 1: No puede haber ninguna jornada OPEN ya existente en esta relación
      const openWorkDay = await tx.workDay.findFirst({
        where: {
          employmentRelationshipId: relationshipId,
          status: WorkDayStatus.OPEN,
        },
      });

      if (openWorkDay !== null) {
        throw new UnprocessableError(
          'ATTENDANCE_ALREADY_OPEN',
          'Ya existe una jornada abierta para esta relación. Fichá la salida antes de iniciar otra.',
        );
      }

      // Invariante 2: Buscar si ya existe una jornada para esta fecha
      const existingWorkDayForDate = await tx.workDay.findUnique({
        where: {
          employmentRelationshipId_date: {
            employmentRelationshipId: relationshipId,
            date: localDate,
          },
        },
      });

      if (existingWorkDayForDate !== null) {
        if (existingWorkDayForDate.status !== WorkDayStatus.OPEN) {
          throw new UnprocessableError(
            'ATTENDANCE_ALREADY_CLOSED',
            'La jornada de esta fecha ya fue registrada o cerrada previamente. Si necesitás modificar los horarios, solicitá una corrección.',
          );
        }
        throw new UnprocessableError(
          'ATTENDANCE_ALREADY_OPEN',
          'Ya existe una jornada abierta para esta relación. Fichá la salida antes de iniciar otra.',
        );
      }

      let workDay: { id: string };
      try {
        workDay = await tx.workDay.create({
          data: {
            employmentRelationshipId: relationshipId,
            date: localDate,
            status: WorkDayStatus.OPEN,
            createdByUserId: actor.userId,
            realMinutes: 0,
            computableMinutes: 0,
          },
        });
      } catch {
        throw new UnprocessableError(
          'ATTENDANCE_ALREADY_OPEN',
          'Ya existe una jornada abierta para esta relación. Fichá la salida antes de iniciar otra.',
        );
      }

      try {
        await tx.timeEntry.create({
          data: {
            employmentRelationshipId: relationshipId,
            workDayId: workDay.id,
            kind: TimeEntryKind.CLOCK_IN,
            status: TimeEntryStatus.RECORDED,
            declaredAt,
            receivedAt,
            timezone,
            method: (input.method as ClockInMethod) ?? ClockInMethod.BUTTON,
            clientIdempotencyKey,
            deviceId: input.deviceId ?? null,
            deviceLabel: input.deviceLabel ?? null,
            geoLat: input.location?.lat ?? null,
            geoLng: input.location?.lng ?? null,
            geoAccuracyMeters: input.location?.accuracyMeters ?? null,
            note: input.note ?? null,
            createdByUserId: actor.userId,
          },
        });
      } catch {
        throw new UnprocessableError(
          'ATTENDANCE_ALREADY_OPEN',
          'Ya existe un fichaje de entrada activo para esta jornada.',
        );
      }

      await this.audit.record(tx, {
        action: AuditAction.ATTENDANCE_CLOCKED_IN,
        entityType: 'WorkDay',
        entityId: workDay.id,
        actor: {
          userId: actor.userId,
          role: actor.roles[0] ?? PlatformRole.WORKER,
        },
        after: {
          workDayId: workDay.id,
          declaredAt: declaredAt.toISOString(),
          timezone,
        },
      });

      return tx.workDay.findUniqueOrThrow({
        where: { id: workDay.id },
        include: FULL_WORKDAY_INCLUDE,
      });
    });

    return toAttendanceView(resultWorkDay);
  }

  /**
   * Fichaje de salida (Clock-Out) por la trabajadora.
   */
  async clockOut(
    actor: AuthenticatedActor,
    attendanceId: string,
    input: ClockOutRequest,
    idempotencyHeader?: string,
  ): Promise<AttendanceView> {
    const workDay = await this.prisma.workDay.findUnique({
      where: { id: attendanceId },
      include: FULL_WORKDAY_INCLUDE,
    });

    if (workDay === null) {
      throw new NotFoundError('Jornada no encontrada.');
    }

    const isWorker = workDay.relationship.worker?.userId === actor.userId;
    const isEmployer = workDay.relationship.employer?.userId === actor.userId;

    if (!isWorker && !isEmployer) {
      throw new NotFoundError('Jornada no encontrada.');
    }

    if (!isWorker) {
      throw new ForbiddenError('Sólo la trabajadora asignada puede registrar la salida.');
    }

    if (workDay.relationship.status !== EmploymentRelationshipStatus.ACTIVE) {
      throw new UnprocessableError(
        'RELATIONSHIP_NOT_ACTIVE',
        'La relación laboral no se encuentra activa.',
      );
    }

    const clientIdempotencyKey = input.clientIdempotencyKey ?? idempotencyHeader ?? randomUUID();

    // Idempotencia: si ya existe una salida con la misma clave, devolver la jornada actual
    const existingOut = workDay.timeEntries.find(
      (e) => e.kind === TimeEntryKind.CLOCK_OUT && e.clientIdempotencyKey === clientIdempotencyKey,
    );
    if (existingOut !== undefined) {
      return toAttendanceView(workDay);
    }

    if (workDay.status !== WorkDayStatus.OPEN) {
      throw new UnprocessableError(
        'ATTENDANCE_NOT_OPEN',
        'La jornada no está abierta o ya fue cerrada previamente.',
      );
    }

    const clockInEntry = workDay.timeEntries.find(
      (e) => e.kind === TimeEntryKind.CLOCK_IN && e.status !== TimeEntryStatus.CORRECTED,
    );
    if (clockInEntry === undefined) {
      throw new UnprocessableError(
        'NO_CLOCK_IN_FOUND',
        'No se encontró un fichaje de entrada para esta jornada.',
      );
    }

    // Autoridad de tiempo del servidor
    const now = new Date();
    const declaredAt = now;
    const receivedAt = now;

    if (declaredAt.getTime() < clockInEntry.declaredAt.getTime()) {
      throw new UnprocessableError(
        'INVALID_CLOCK_OUT_TIME',
        'La hora de salida no puede ser anterior a la hora de entrada registrada.',
      );
    }

    const realMinutes = Math.max(
      0,
      Math.floor((declaredAt.getTime() - clockInEntry.declaredAt.getTime()) / 60000),
    );
    const computableMinutes = Math.max(0, realMinutes - (workDay.breakMinutes ?? 0));

    const resultWorkDay = await this.prisma.$transaction(async (tx: PrismaTx) => {
      // CAS atómico sobre WorkDay: debe estar OPEN
      const updateResult = await tx.workDay.updateMany({
        where: {
          id: workDay.id,
          status: WorkDayStatus.OPEN,
        },
        data: {
          status: WorkDayStatus.PENDING_APPROVAL,
          realMinutes,
          computableMinutes,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new UnprocessableError(
          'ATTENDANCE_NOT_OPEN',
          'La jornada no está abierta o ya fue cerrada previamente.',
        );
      }

      try {
        await tx.timeEntry.create({
          data: {
            employmentRelationshipId: workDay.employmentRelationshipId,
            workDayId: workDay.id,
            kind: TimeEntryKind.CLOCK_OUT,
            status: TimeEntryStatus.RECORDED,
            declaredAt,
            receivedAt,
            timezone: clockInEntry.timezone,
            method: clockInEntry.method,
            clientIdempotencyKey,
            note: input.note ?? null,
            createdByUserId: actor.userId,
          },
        });
      } catch {
        throw new UnprocessableError(
          'ATTENDANCE_NOT_OPEN',
          'La jornada no está abierta o ya fue cerrada previamente.',
        );
      }

      await this.audit.record(tx, {
        action: AuditAction.ATTENDANCE_CLOCKED_OUT,
        entityType: 'WorkDay',
        entityId: workDay.id,
        actor: {
          userId: actor.userId,
          role: actor.roles[0] ?? PlatformRole.WORKER,
        },
        before: { status: workDay.status },
        after: {
          status: WorkDayStatus.PENDING_APPROVAL,
          realMinutes,
          computableMinutes,
          declaredAt: declaredAt.toISOString(),
        },
      });

      if (workDay.relationship.employer.user.email) {
        await this.outbox.enqueueEmail(tx, {
          to: workDay.relationship.employer.user.email,
          subject: 'Nueva jornada pendiente de revisión',
          text: `La trabajadora registró la salida de su jornada del ${workDay.date.toISOString().slice(0, 10)}. Podés revisarla y aprobarla desde tu panel.`,
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
   * Listar jornadas de una relación con filtros.
   */
  async list(
    actor: AuthenticatedActor,
    relationshipId: string,
    query: AttendanceListQuery,
  ): Promise<AttendanceView[]> {
    const relationship = await this.prisma.employmentRelationship.findUnique({
      where: { id: relationshipId },
      include: { employer: true, worker: true },
    });

    if (relationship === null) {
      throw new NotFoundError('Relación laboral no encontrada.');
    }

    const isEmployer = relationship.employer.userId === actor.userId;
    const isWorker = relationship.worker?.userId === actor.userId;

    if (!isEmployer && !isWorker) {
      throw new NotFoundError('Relación laboral no encontrada.');
    }

    const where: Prisma.WorkDayWhereInput = {
      employmentRelationshipId: relationshipId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
              ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    const workDays = await this.prisma.workDay.findMany({
      where,
      include: FULL_WORKDAY_INCLUDE,
      orderBy: { date: 'desc' },
      take: query.limit,
      skip: (query.page - 1) * query.limit,
    });

    return workDays.map(toAttendanceView);
  }

  /**
   * Obtener detalle de una jornada por ID.
   */
  async getById(actor: AuthenticatedActor, attendanceId: string): Promise<AttendanceView> {
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

    return toAttendanceView(workDay);
  }

  /**
   * Aprobación de la jornada por la familia.
   */
  async approve(
    actor: AuthenticatedActor,
    attendanceId: string,
    input: ApproveAttendanceRequest,
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
      throw new ForbiddenError('Sólo la familia empleadora titular puede aprobar las jornadas.');
    }

    if (workDay.version !== input.expectedVersion) {
      throw new ResourceVersionConflictError(
        'La jornada cambió mientras la estabas revisando. Actualizamos la información para que puedas revisarla nuevamente.',
      );
    }

    if (workDay.status === WorkDayStatus.APPROVED) {
      return toAttendanceView(workDay);
    }

    if (workDay.status === WorkDayStatus.DISPUTED) {
      throw new UnprocessableError(
        'CANNOT_APPROVE_DISPUTED_ATTENDANCE',
        'Esta jornada tiene una corrección pendiente de resolución. Debés aprobar o rechazar la corrección antes de continuar.',
      );
    }

    if (workDay.status !== WorkDayStatus.PENDING_APPROVAL) {
      throw new UnprocessableError(
        'CANNOT_APPROVE_NON_PENDING_ATTENDANCE',
        'Sólo se pueden aprobar jornadas que se encuentren pendientes de aprobación.',
      );
    }

    const pendingCorrection = workDay.corrections.find((c) => c.status === 'PENDING');
    if (pendingCorrection !== undefined) {
      throw new UnprocessableError(
        'CORRECTION_PENDING',
        'Existe una solicitud de corrección pendiente para esta jornada. Resolvé la corrección antes de aprobar.',
      );
    }

    // approvedMinutes representa la duración efectiva aprobada (sin aplicar reglas de liquidación ni deducciones automáticas)
    const clockIn = workDay.timeEntries.find(
      (e) => e.kind === TimeEntryKind.CLOCK_IN && e.status !== TimeEntryStatus.CORRECTED,
    );
    const clockOut = workDay.timeEntries.find(
      (e) => e.kind === TimeEntryKind.CLOCK_OUT && e.status !== TimeEntryStatus.CORRECTED,
    );
    const effectiveIn = clockIn?.declaredAt ?? workDay.date;
    const effectiveOut = clockOut?.declaredAt ?? effectiveIn;
    const approvedMinutes = Math.max(
      0,
      Math.floor((effectiveOut.getTime() - effectiveIn.getTime()) / 60000),
    );

    const resultWorkDay = await this.prisma.$transaction(async (tx: PrismaTx) => {
      const updateResult = await tx.workDay.updateMany({
        where: {
          id: workDay.id,
          status: WorkDayStatus.PENDING_APPROVAL,
          version: input.expectedVersion,
        },
        data: {
          status: WorkDayStatus.APPROVED,
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

      await tx.timeEntry.updateMany({
        where: {
          workDayId: workDay.id,
          status: { in: [TimeEntryStatus.RECORDED, TimeEntryStatus.PENDING_APPROVAL] },
        },
        data: {
          status: TimeEntryStatus.APPROVED,
        },
      });

      await this.audit.record(tx, {
        action: AuditAction.ATTENDANCE_APPROVED,
        entityType: 'WorkDay',
        entityId: workDay.id,
        actor: {
          userId: actor.userId,
          role: actor.roles[0] ?? PlatformRole.FAMILY_EMPLOYER,
        },
        before: { status: workDay.status, approvedMinutes: workDay.approvedMinutes },
        after: {
          status: WorkDayStatus.APPROVED,
          approvedMinutes,
        },
      });

      if (workDay.relationship.worker?.user.email) {
        await this.outbox.enqueueEmail(tx, {
          to: workDay.relationship.worker.user.email,
          subject: 'Jornada aprobada',
          text: `La familia empleadora aprobó tu jornada del ${workDay.date.toISOString().slice(0, 10)}.`,
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
