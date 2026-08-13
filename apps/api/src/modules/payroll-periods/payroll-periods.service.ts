import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  PeriodType,
  PlatformRole,
  PayrollPeriodStatus,
  WorkDayStatus,
  type Prisma,
} from '@casas/database';
import { ResourceVersionConflictError } from '@casas/domain';
import type {
  CloseAttendancePeriodRequest,
  CreateMonthlyPeriodRequest,
  MonthlyAttendanceSummary,
  MonthlyPeriodView,
  PeriodAttendanceSnapshotDay,
  PeriodAttendanceSnapshotPayload,
  PeriodAttendanceSnapshotView,
} from '@casas/contracts';
import { AuditAction, AuditService } from '../../common/audit/audit.service';
import { PrismaService, type PrismaTx } from '../../common/prisma/prisma.service';
import { ForbiddenError, NotFoundError, UnprocessableError } from '../../common/http/app.errors';
import type { AuthenticatedActor } from '../../common/auth/auth.types';
import { OutboxNotificationService } from '../notifications/outbox-notification.service';
import { canCloseMonthlyAttendancePeriod } from './payroll-period-policy';

const FULL_PERIOD_INCLUDE = {
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
  attendanceSnapshot: true,
} as const;

type PayrollPeriodWithDetails = Prisma.PayrollPeriodGetPayload<{
  include: typeof FULL_PERIOD_INCLUDE;
}>;

export function calculatePeriodDates(
  year: number,
  month: number,
): { fromDate: Date; toDate: Date; fromDateStr: string; toDateStr: string } {
  const fromDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const toDateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const fromDate = new Date(`${fromDateStr}T00:00:00.000Z`);
  const toDate = new Date(`${toDateStr}T00:00:00.000Z`);
  return { fromDate, toDate, fromDateStr, toDateStr };
}

@Injectable()
export class PayrollPeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxNotificationService,
  ) {}

  /**
   * Obtener o crear un período mensual para la relación.
   */
  async getOrCreate(
    actor: AuthenticatedActor,
    relationshipId: string,
    input: CreateMonthlyPeriodRequest,
  ): Promise<MonthlyPeriodView> {
    const relationship = await this.prisma.employmentRelationship.findUnique({
      where: { id: relationshipId },
      include: {
        employer: { select: { userId: true } },
        worker: { select: { userId: true } },
      },
    });

    if (relationship === null) {
      throw new NotFoundError('Relación laboral no encontrada.');
    }

    const isEmployer = relationship.employer.userId === actor.userId;
    const isWorker = relationship.worker?.userId === actor.userId;

    if (!isEmployer && !isWorker) {
      throw new NotFoundError('Relación laboral no encontrada.');
    }

    const { fromDate, toDate, fromDateStr, toDateStr } = calculatePeriodDates(
      input.year,
      input.month,
    );

    // Intentar buscar período existente
    let period = await this.prisma.payrollPeriod.findUnique({
      where: {
        employmentRelationshipId_year_month_periodType: {
          employmentRelationshipId: relationshipId,
          year: input.year,
          month: input.month,
          periodType: PeriodType.MONTHLY,
        },
      },
      include: FULL_PERIOD_INCLUDE,
    });

    if (period === null) {
      try {
        period = await this.prisma.$transaction(async (tx: PrismaTx) => {
          const created = await tx.payrollPeriod.create({
            data: {
              employmentRelationshipId: relationshipId,
              year: input.year,
              month: input.month,
              periodType: PeriodType.MONTHLY,
              status: PayrollPeriodStatus.OPEN,
              fromDate,
              toDate,
              createdByUserId: actor.userId,
            },
            include: FULL_PERIOD_INCLUDE,
          });

          await this.audit.record(tx, {
            action: AuditAction.MONTHLY_PERIOD_CREATED,
            entityType: 'PayrollPeriod',
            entityId: created.id,
            actor: {
              userId: actor.userId,
              role: isEmployer ? PlatformRole.FAMILY_EMPLOYER : PlatformRole.WORKER,
            },
            after: {
              periodId: created.id,
              relationshipId,
              year: input.year,
              month: input.month,
            },
          });

          return created;
        });
      } catch (err: unknown) {
        // En caso de creación concurrente con violación de clave única (P2002), recuperar el creado por la otra transacción
        const isUniqueViolation =
          err !== null &&
          typeof err === 'object' &&
          'code' in err &&
          (err as { code: string }).code === 'P2002';

        if (isUniqueViolation) {
          period = await this.prisma.payrollPeriod.findUniqueOrThrow({
            where: {
              employmentRelationshipId_year_month_periodType: {
                employmentRelationshipId: relationshipId,
                year: input.year,
                month: input.month,
                periodType: PeriodType.MONTHLY,
              },
            },
            include: FULL_PERIOD_INCLUDE,
          });
        } else {
          throw err;
        }
      }
    }

    const isClosed =
      period.status === PayrollPeriodStatus.READY_FOR_CALCULATION ||
      period.attendanceApprovedAt != null ||
      period.attendanceSnapshot != null;

    let summary: MonthlyAttendanceSummary;
    if (isClosed && period.attendanceSnapshot) {
      summary = {
        approvedDays: period.attendanceSnapshot.approvedDays,
        approvedMinutes: period.attendanceSnapshot.approvedMinutes,
        openDays: 0,
        pendingApprovalDays: 0,
        disputedDays: 0,
        totalAttendanceDays: period.attendanceSnapshot.approvedDays,
      };
    } else {
      summary = await this.computeAttendanceSummary(relationshipId, fromDate, toDate);
    }

    return this.toMonthlyPeriodView(period, fromDateStr, toDateStr, summary);
  }

  /**
   * Listar períodos de una relación laboral.
   */
  async listByRelationship(
    actor: AuthenticatedActor,
    relationshipId: string,
  ): Promise<MonthlyPeriodView[]> {
    const relationship = await this.prisma.employmentRelationship.findUnique({
      where: { id: relationshipId },
      include: {
        employer: { select: { userId: true } },
        worker: { select: { userId: true } },
      },
    });

    if (relationship === null) {
      throw new NotFoundError('Relación laboral no encontrada.');
    }

    const isEmployer = relationship.employer.userId === actor.userId;
    const isWorker = relationship.worker?.userId === actor.userId;

    if (!isEmployer && !isWorker) {
      throw new NotFoundError('Relación laboral no encontrada.');
    }

    const periods = await this.prisma.payrollPeriod.findMany({
      where: { employmentRelationshipId: relationshipId },
      include: FULL_PERIOD_INCLUDE,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    const views: MonthlyPeriodView[] = [];
    for (const period of periods) {
      const { fromDate, toDate, fromDateStr, toDateStr } = calculatePeriodDates(
        period.year,
        period.month,
      );
      const isClosed =
        period.status === PayrollPeriodStatus.READY_FOR_CALCULATION ||
        period.attendanceApprovedAt != null ||
        period.attendanceSnapshot != null;

      let summary: MonthlyAttendanceSummary;
      if (isClosed && period.attendanceSnapshot) {
        summary = {
          approvedDays: period.attendanceSnapshot.approvedDays,
          approvedMinutes: period.attendanceSnapshot.approvedMinutes,
          openDays: 0,
          pendingApprovalDays: 0,
          disputedDays: 0,
          totalAttendanceDays: period.attendanceSnapshot.approvedDays,
        };
      } else {
        summary = await this.computeAttendanceSummary(relationshipId, fromDate, toDate);
      }

      views.push(this.toMonthlyPeriodView(period, fromDateStr, toDateStr, summary));
    }

    return views;
  }

  /**
   * Obtener detalle de un período por ID.
   */
  async getById(actor: AuthenticatedActor, periodId: string): Promise<MonthlyPeriodView> {
    const period = await this.prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      include: FULL_PERIOD_INCLUDE,
    });

    if (period === null) {
      throw new NotFoundError('Período mensual no encontrado.');
    }

    const isEmployer = period.relationship.employer.userId === actor.userId;
    const isWorker = period.relationship.worker?.userId === actor.userId;

    if (!isEmployer && !isWorker) {
      throw new NotFoundError('Período mensual no encontrado.');
    }

    const { fromDate, toDate, fromDateStr, toDateStr } = calculatePeriodDates(
      period.year,
      period.month,
    );

    const isClosed =
      period.status === PayrollPeriodStatus.READY_FOR_CALCULATION ||
      period.attendanceApprovedAt != null ||
      period.attendanceSnapshot != null;

    let summary: MonthlyAttendanceSummary;
    if (isClosed && period.attendanceSnapshot) {
      summary = {
        approvedDays: period.attendanceSnapshot.approvedDays,
        approvedMinutes: period.attendanceSnapshot.approvedMinutes,
        openDays: 0,
        pendingApprovalDays: 0,
        disputedDays: 0,
        totalAttendanceDays: period.attendanceSnapshot.approvedDays,
      };
    } else {
      summary = await this.computeAttendanceSummary(
        period.employmentRelationshipId,
        fromDate,
        toDate,
      );
    }

    return this.toMonthlyPeriodView(period, fromDateStr, toDateStr, summary);
  }

  /**
   * Cierre de asistencia del período por la familia empleadora con generación de snapshot inmutable.
   *
   * Operación 100% transaccional con lock de serialización y lectura de estado dentro de la transacción.
   */
  async closeAttendance(
    actor: AuthenticatedActor,
    periodId: string,
    input: CloseAttendancePeriodRequest,
  ): Promise<MonthlyPeriodView> {
    const period = await this.prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      include: FULL_PERIOD_INCLUDE,
    });

    if (period === null) {
      throw new NotFoundError('Período mensual no encontrado.');
    }

    const isEmployer = period.relationship.employer.userId === actor.userId;
    const isWorker = period.relationship.worker?.userId === actor.userId;

    if (!isEmployer && !isWorker) {
      throw new NotFoundError('Período mensual no encontrado.');
    }

    if (!isEmployer) {
      throw new ForbiddenError(
        'Sólo la familia empleadora titular puede cerrar la asistencia del período.',
      );
    }

    if (period.version !== input.expectedVersion) {
      throw new ResourceVersionConflictError(
        'El período cambió mientras lo estabas revisando. Actualizamos la información para que puedas revisarlo nuevamente.',
      );
    }

    if (
      period.status === PayrollPeriodStatus.READY_FOR_CALCULATION ||
      period.attendanceApprovedAt != null
    ) {
      const { fromDateStr, toDateStr } = calculatePeriodDates(period.year, period.month);
      return this.toMonthlyPeriodView(period, fromDateStr, toDateStr);
    }

    const timezone = period.relationship.household?.timezone ?? 'America/Argentina/Buenos_Aires';

    // Invariante temporal: el mes debe haber finalizado en la zona horaria del hogar
    if (!canCloseMonthlyAttendancePeriod(period.year, period.month, timezone)) {
      throw new UnprocessableError(
        'ATTENDANCE_PERIOD_NOT_FINISHED',
        'La asistencia de este período todavía no puede cerrarse porque el mes aún no finalizó.',
      );
    }

    const { fromDate, toDate, fromDateStr, toDateStr } = calculatePeriodDates(
      period.year,
      period.month,
    );

    return await this.prisma.$transaction(async (tx: PrismaTx) => {
      // 1. Bloqueo de concurrencia a nivel de transacción PostgreSQL (advisory lock)
      if (
        typeof (tx as unknown as { $executeRawUnsafe?: (sql: string) => Promise<unknown> })
          .$executeRawUnsafe === 'function'
      ) {
        await (
          tx as unknown as { $executeRawUnsafe: (sql: string) => Promise<unknown> }
        ).$executeRawUnsafe(
          `SELECT pg_advisory_xact_lock(hashtext('attendance_lock:${period.employmentRelationshipId}:${period.year}:${period.month}'))`,
        );
      }

      // 2. Releer el PayrollPeriod dentro de la transacción
      const currentPeriod = await tx.payrollPeriod.findUniqueOrThrow({
        where: { id: period.id },
        include: FULL_PERIOD_INCLUDE,
      });

      if (currentPeriod.version !== input.expectedVersion) {
        throw new ResourceVersionConflictError(
          'El período cambió mientras lo estabas revisando. Actualizamos la información para que puedas revisarlo nuevamente.',
        );
      }

      if (
        currentPeriod.status === PayrollPeriodStatus.READY_FOR_CALCULATION ||
        currentPeriod.attendanceApprovedAt != null
      ) {
        return this.toMonthlyPeriodView(currentPeriod, fromDateStr, toDateStr);
      }

      // 3. Releer todas las jornadas del mes dentro de la transacción
      const workDays = await tx.workDay.findMany({
        where: {
          employmentRelationshipId: currentPeriod.employmentRelationshipId,
          date: { gte: fromDate, lte: toDate },
        },
        include: {
          timeEntries: { orderBy: { declaredAt: 'asc' } },
          corrections: { where: { status: 'PENDING' } },
        },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
      });

      const openDays = workDays.filter((d) => d.status === WorkDayStatus.OPEN).length;
      const pendingApprovalDays = workDays.filter(
        (d) => d.status === WorkDayStatus.PENDING_APPROVAL,
      ).length;
      const disputedDays = workDays.filter(
        (d) => d.status === WorkDayStatus.DISPUTED || d.corrections.length > 0,
      ).length;

      if (openDays > 0 || pendingApprovalDays > 0 || disputedDays > 0) {
        throw new UnprocessableError(
          'ATTENDANCE_PERIOD_NOT_READY',
          'No se puede cerrar la asistencia del período porque existen jornadas abiertas, pendientes de aprobación o en disputa.',
        );
      }

      const approvedWorkDays = workDays.filter((d) => d.status === WorkDayStatus.APPROVED);

      if (approvedWorkDays.length === 0) {
        throw new UnprocessableError(
          'EMPTY_ATTENDANCE_PERIOD',
          'No se puede cerrar un período que no contenga jornadas aprobadas.',
        );
      }

      for (const day of approvedWorkDays) {
        if (day.approvedMinutes === null || day.approvedMinutes < 0) {
          throw new UnprocessableError(
            'PERIOD_DATA_INTEGRITY_ERROR',
            'Se detectó una jornada aprobada sin minutos computados válidos. Verificá los registros antes de cerrar.',
          );
        }
      }

      const approvedDays = approvedWorkDays.length;
      const approvedMinutes = approvedWorkDays.reduce(
        (sum, d) => sum + (d.approvedMinutes ?? 0),
        0,
      );

      // 4. Construcción determinista del snapshot canónico
      const snapshotDays: PeriodAttendanceSnapshotDay[] = approvedWorkDays.map((day) => {
        const clockIn = day.timeEntries.find(
          (e) => e.kind === 'CLOCK_IN' && e.status !== 'CORRECTED',
        );
        const clockOut = day.timeEntries.find(
          (e) => e.kind === 'CLOCK_OUT' && e.status !== 'CORRECTED',
        );
        return {
          workDayId: day.id,
          workDayVersion: day.version,
          date: day.date.toISOString().slice(0, 10),
          approvedMinutes: day.approvedMinutes!,
          approvedClockInAt: clockIn?.declaredAt ? clockIn.declaredAt.toISOString() : null,
          approvedClockOutAt: clockOut?.declaredAt ? clockOut.declaredAt.toISOString() : null,
          approvedAt: day.approvedAt ? day.approvedAt.toISOString() : null,
        };
      });

      const canonicalPayload: PeriodAttendanceSnapshotPayload = {
        schemaVersion: '1.0',
        relationshipId: currentPeriod.employmentRelationshipId,
        periodId: currentPeriod.id,
        year: currentPeriod.year,
        month: currentPeriod.month,
        days: snapshotDays,
        approvedDays,
        approvedMinutes,
      };

      const canonicalJson = JSON.stringify(canonicalPayload);
      const hash = createHash('sha256').update(canonicalJson).digest('hex');

      // 5. CAS atómico sobre el período
      const updateResult = await tx.payrollPeriod.updateMany({
        where: {
          id: currentPeriod.id,
          version: input.expectedVersion,
          status: {
            in: [PayrollPeriodStatus.OPEN, PayrollPeriodStatus.PENDING_ATTENDANCE_APPROVAL],
          },
        },
        data: {
          status: PayrollPeriodStatus.READY_FOR_CALCULATION,
          attendanceApprovedAt: new Date(),
          attendanceApprovedByUserId: actor.userId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new ResourceVersionConflictError(
          'El período cambió mientras lo estabas revisando. Actualizamos la información para que puedas revisarlo nuevamente.',
        );
      }

      // 6. Vincular jornadas aprobadas al período
      await tx.workDay.updateMany({
        where: { id: { in: approvedWorkDays.map((d) => d.id) } },
        data: { payrollPeriodId: currentPeriod.id },
      });

      // 7. Persistir snapshot inmutable
      const createdSnapshot = await tx.periodAttendanceSnapshot.create({
        data: {
          payrollPeriodId: currentPeriod.id,
          schemaVersion: '1.0',
          approvedDays,
          approvedMinutes,
          payload: canonicalPayload as unknown as Prisma.InputJsonValue,
          hash,
          createdByUserId: actor.userId,
        },
      });

      // 8. Registrar auditoría append-only
      await this.audit.record(tx, {
        action: AuditAction.MONTHLY_ATTENDANCE_CLOSED,
        entityType: 'PayrollPeriod',
        entityId: currentPeriod.id,
        actor: {
          userId: actor.userId,
          role: PlatformRole.FAMILY_EMPLOYER,
        },
        before: { status: currentPeriod.status },
        after: {
          status: PayrollPeriodStatus.READY_FOR_CALCULATION,
          approvedDays,
          approvedMinutes,
          snapshotHash: hash,
          snapshotSchemaVersion: '1.0',
        },
      });

      // 9. Encolar notificación en outbox
      if (currentPeriod.relationship.worker?.user.email) {
        await this.outbox.enqueueEmail(tx, {
          to: currentPeriod.relationship.worker.user.email,
          subject: 'Asistencia mensual aprobada y cerrada',
          text: `La familia empleadora cerró la asistencia de ${currentPeriod.month}/${currentPeriod.year} con un total de ${approvedDays} jornadas y ${approvedMinutes} minutos aprobados.`,
        });
      }

      const closedPeriodWithSnapshot: PayrollPeriodWithDetails = {
        ...currentPeriod,
        status: PayrollPeriodStatus.READY_FOR_CALCULATION,
        version: currentPeriod.version + 1,
        attendanceApprovedAt: new Date(),
        attendanceApprovedByUserId: actor.userId,
        attendanceSnapshot: createdSnapshot,
      };

      return this.toMonthlyPeriodView(closedPeriodWithSnapshot, fromDateStr, toDateStr);
    });
  }

  /**
   * Resumen computado de asistencia para un período mensual abierto.
   */
  private async computeAttendanceSummary(
    relationshipId: string,
    fromDate: Date,
    toDate: Date,
  ): Promise<MonthlyAttendanceSummary> {
    const workDays = await this.prisma.workDay.findMany({
      where: {
        employmentRelationshipId: relationshipId,
        date: { gte: fromDate, lte: toDate },
      },
      include: {
        corrections: { where: { status: 'PENDING' } },
      },
    });

    const approvedWorkDays = workDays.filter((d) => d.status === WorkDayStatus.APPROVED);
    const approvedDays = approvedWorkDays.length;
    const approvedMinutes = approvedWorkDays.reduce((sum, d) => sum + (d.approvedMinutes ?? 0), 0);

    const openDays = workDays.filter((d) => d.status === WorkDayStatus.OPEN).length;
    const pendingApprovalDays = workDays.filter(
      (d) => d.status === WorkDayStatus.PENDING_APPROVAL,
    ).length;
    const disputedDays = workDays.filter(
      (d) => d.status === WorkDayStatus.DISPUTED || d.corrections.length > 0,
    ).length;

    return {
      approvedDays,
      approvedMinutes,
      openDays,
      pendingApprovalDays,
      disputedDays,
      totalAttendanceDays: workDays.length,
    };
  }

  /**
   * Transforma la entidad PayrollPeriod y su snapshot a la vista de contrato.
   */
  private toMonthlyPeriodView(
    period: PayrollPeriodWithDetails,
    fromDateStr: string,
    toDateStr: string,
    computedSummary?: MonthlyAttendanceSummary,
  ): MonthlyPeriodView {
    const isClosed =
      period.status === PayrollPeriodStatus.READY_FOR_CALCULATION ||
      period.attendanceApprovedAt != null ||
      period.attendanceSnapshot != null;

    let snapshotView: PeriodAttendanceSnapshotView | null = null;
    let attendanceSummary: MonthlyAttendanceSummary;

    if (period.attendanceSnapshot) {
      snapshotView = {
        id: period.attendanceSnapshot.id,
        payrollPeriodId: period.attendanceSnapshot.payrollPeriodId,
        schemaVersion: period.attendanceSnapshot.schemaVersion,
        approvedDays: period.attendanceSnapshot.approvedDays,
        approvedMinutes: period.attendanceSnapshot.approvedMinutes,
        hash: period.attendanceSnapshot.hash,
        createdAt: period.attendanceSnapshot.createdAt.toISOString(),
        createdByUserId: period.attendanceSnapshot.createdByUserId,
        payload:
          (period.attendanceSnapshot.payload as unknown as PeriodAttendanceSnapshotPayload) ??
          undefined,
      };
    }

    if (isClosed && period.attendanceSnapshot) {
      // Para períodos cerrados, la fuente de verdad inmutable es el snapshot
      attendanceSummary = {
        approvedDays: period.attendanceSnapshot.approvedDays,
        approvedMinutes: period.attendanceSnapshot.approvedMinutes,
        openDays: 0,
        pendingApprovalDays: 0,
        disputedDays: 0,
        totalAttendanceDays: period.attendanceSnapshot.approvedDays,
      };
    } else if (computedSummary) {
      attendanceSummary = computedSummary;
    } else {
      attendanceSummary = {
        approvedDays: 0,
        approvedMinutes: 0,
        openDays: 0,
        pendingApprovalDays: 0,
        disputedDays: 0,
        totalAttendanceDays: 0,
      };
    }

    return {
      id: period.id,
      relationshipId: period.employmentRelationshipId,
      year: period.year,
      month: period.month,
      periodType: period.periodType,
      status: period.status,
      fromDate: fromDateStr,
      toDate: toDateStr,
      version: period.version,
      attendanceApprovedAt: period.attendanceApprovedAt?.toISOString() ?? null,
      attendanceApprovedByUserId: period.attendanceApprovedByUserId,
      closedAt: period.closedAt?.toISOString() ?? null,
      closedByUserId: period.closedByUserId,
      attendance: attendanceSummary,
      snapshot: snapshotView,
      createdAt: period.createdAt.toISOString(),
      updatedAt: period.updatedAt.toISOString(),
    };
  }
}
