import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PeriodType, PlatformRole, PayrollPeriodStatus, WorkDayStatus } from '@casas/database';
import { ResourceVersionConflictError } from '@casas/domain';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { AuditService } from '../../../common/audit/audit.service';
import type { OutboxNotificationService } from '../../notifications/outbox-notification.service';
import { ForbiddenError, NotFoundError, UnprocessableError } from '../../../common/http/app.errors';
import type { AuthenticatedActor } from '../../../common/auth/auth.types';
import { PayrollPeriodsService, calculatePeriodDates } from '../payroll-periods.service';

describe('PayrollPeriodsService', () => {
  let service: PayrollPeriodsService;
  let prisma: {
    employmentRelationship: { findUnique: ReturnType<typeof vi.fn> };
    payrollPeriod: {
      findUnique: ReturnType<typeof vi.fn>;
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    workDay: {
      findMany: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    periodAttendanceSnapshot: {
      create: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
    $executeRawUnsafe: ReturnType<typeof vi.fn>;
  };
  let audit: { record: ReturnType<typeof vi.fn> };
  let outbox: { enqueueEmail: ReturnType<typeof vi.fn> };

  const employerActor: AuthenticatedActor = {
    userId: 'user-employer',
    employerId: 'emp-1',
    workerId: null,
    roles: [PlatformRole.FAMILY_EMPLOYER],
    sessionId: 'sess-1',
  };

  const workerActor: AuthenticatedActor = {
    userId: 'user-worker',
    employerId: null,
    workerId: 'wrk-1',
    roles: [PlatformRole.WORKER],
    sessionId: 'sess-2',
  };

  const strangerActor: AuthenticatedActor = {
    userId: 'user-stranger',
    employerId: 'emp-stranger',
    workerId: null,
    roles: [PlatformRole.FAMILY_EMPLOYER],
    sessionId: 'sess-3',
  };

  const activeRelationship = {
    id: 'rel-1',
    employerId: 'emp-1',
    workerId: 'wrk-1',
    status: 'ACTIVE',
    employer: {
      userId: 'user-employer',
      user: { email: 'employer@test.local' },
    },
    worker: {
      userId: 'user-worker',
      user: { email: 'worker@test.local' },
    },
    household: {
      id: 'hh-1',
      label: 'Casa Palermo',
      city: 'CABA',
      timezone: 'America/Argentina/Buenos_Aires',
    },
  };

  beforeEach(() => {
    prisma = {
      employmentRelationship: {
        findUnique: vi.fn(),
      },
      payrollPeriod: {
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      workDay: {
        findMany: vi.fn(),
        updateMany: vi.fn(),
      },
      periodAttendanceSnapshot: {
        create: vi.fn(),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
      $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    };

    audit = {
      record: vi.fn().mockResolvedValue(undefined),
    };

    outbox = {
      enqueueEmail: vi.fn().mockResolvedValue(undefined),
    };

    service = new PayrollPeriodsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      outbox as unknown as OutboxNotificationService,
    );
  });

  describe('calculatePeriodDates', () => {
    it('calcula correctamente primer y último día del mes en UTC', () => {
      const aug = calculatePeriodDates(2026, 8);
      expect(aug.fromDateStr).toBe('2026-08-01');
      expect(aug.toDateStr).toBe('2026-08-31');

      const febLeap = calculatePeriodDates(2024, 2);
      expect(febLeap.fromDateStr).toBe('2024-02-01');
      expect(febLeap.toDateStr).toBe('2024-02-29');

      const febNonLeap = calculatePeriodDates(2025, 2);
      expect(febNonLeap.fromDateStr).toBe('2025-02-01');
      expect(febNonLeap.toDateStr).toBe('2025-02-28');
    });
  });

  describe('getOrCreate', () => {
    it('crea un período mensual OPEN si no existía', async () => {
      prisma.employmentRelationship.findUnique.mockResolvedValue(activeRelationship);
      prisma.payrollPeriod.findUnique.mockResolvedValue(null);

      const createdPeriod = {
        id: 'per-1',
        employmentRelationshipId: 'rel-1',
        year: 2026,
        month: 8,
        periodType: PeriodType.MONTHLY,
        status: PayrollPeriodStatus.OPEN,
        fromDate: new Date('2026-08-01T00:00:00.000Z'),
        toDate: new Date('2026-08-31T00:00:00.000Z'),
        attendanceApprovedAt: null,
        attendanceApprovedByUserId: null,
        closedAt: null,
        closedByUserId: null,
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        relationship: activeRelationship,
        attendanceSnapshot: null,
      };

      prisma.payrollPeriod.create.mockResolvedValue(createdPeriod);
      prisma.workDay.findMany.mockResolvedValue([]);

      const result = await service.getOrCreate(employerActor, 'rel-1', { year: 2026, month: 8 });

      expect(result.id).toBe('per-1');
      expect(result.status).toBe('OPEN');
      expect(result.year).toBe(2026);
      expect(result.month).toBe(8);
      expect(result.attendance.totalAttendanceDays).toBe(0);
      expect(prisma.payrollPeriod.create).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalled();
    });

    it('devuelve el período existente de forma idempotente', async () => {
      prisma.employmentRelationship.findUnique.mockResolvedValue(activeRelationship);

      const existingPeriod = {
        id: 'per-1',
        employmentRelationshipId: 'rel-1',
        year: 2026,
        month: 8,
        periodType: PeriodType.MONTHLY,
        status: PayrollPeriodStatus.OPEN,
        fromDate: new Date('2026-08-01T00:00:00.000Z'),
        toDate: new Date('2026-08-31T00:00:00.000Z'),
        attendanceApprovedAt: null,
        attendanceApprovedByUserId: null,
        closedAt: null,
        closedByUserId: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        relationship: activeRelationship,
        attendanceSnapshot: null,
      };

      prisma.payrollPeriod.findUnique.mockResolvedValue(existingPeriod);
      prisma.workDay.findMany.mockResolvedValue([
        { status: WorkDayStatus.APPROVED, approvedMinutes: 480, corrections: [] },
      ]);

      const result = await service.getOrCreate(workerActor, 'rel-1', { year: 2026, month: 8 });

      expect(result.id).toBe('per-1');
      expect(result.attendance.approvedDays).toBe(1);
      expect(result.attendance.approvedMinutes).toBe(480);
      expect(prisma.payrollPeriod.create).not.toHaveBeenCalled();
    });

    it('recupera el período concurrentemente creado ante colisión P2002', async () => {
      prisma.employmentRelationship.findUnique.mockResolvedValue(activeRelationship);
      prisma.payrollPeriod.findUnique.mockResolvedValue(null);

      const p2002Error = new Error('Unique constraint failed') as Error & { code: string };
      p2002Error.code = 'P2002';
      prisma.payrollPeriod.create.mockRejectedValue(p2002Error);

      const recoveredPeriod = {
        id: 'per-concurrent',
        employmentRelationshipId: 'rel-1',
        year: 2026,
        month: 8,
        periodType: PeriodType.MONTHLY,
        status: PayrollPeriodStatus.OPEN,
        fromDate: new Date('2026-08-01T00:00:00.000Z'),
        toDate: new Date('2026-08-31T00:00:00.000Z'),
        attendanceApprovedAt: null,
        attendanceApprovedByUserId: null,
        closedAt: null,
        closedByUserId: null,
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        relationship: activeRelationship,
        attendanceSnapshot: null,
      };

      prisma.payrollPeriod.findUniqueOrThrow.mockResolvedValue(recoveredPeriod);
      prisma.workDay.findMany.mockResolvedValue([]);

      const result = await service.getOrCreate(employerActor, 'rel-1', { year: 2026, month: 8 });

      expect(result.id).toBe('per-concurrent');
      expect(prisma.payrollPeriod.findUniqueOrThrow).toHaveBeenCalled();
    });

    it('relanza errores de base de datos ajenos a P2002 sin enmascararlos', async () => {
      prisma.employmentRelationship.findUnique.mockResolvedValue(activeRelationship);
      prisma.payrollPeriod.findUnique.mockResolvedValue(null);

      const dbConnectionError = new Error('Database connection lost') as Error & { code: string };
      dbConnectionError.code = 'P1001';
      prisma.payrollPeriod.create.mockRejectedValue(dbConnectionError);

      await expect(
        service.getOrCreate(employerActor, 'rel-1', { year: 2026, month: 8 }),
      ).rejects.toThrow('Database connection lost');
    });

    it('devuelve 404 NotFound si un usuario ajeno intenta acceder', async () => {
      prisma.employmentRelationship.findUnique.mockResolvedValue(activeRelationship);

      await expect(
        service.getOrCreate(strangerActor, 'rel-1', { year: 2026, month: 8 }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('closeAttendance', () => {
    // Usamos Mayo 2025 (mes pasado finalizado) para validar el flujo completo de cierre
    const pastYear = 2025;
    const pastMonth = 5;

    it('la familia cierra la asistencia exitosamente y genera snapshot inmutable', async () => {
      const openPeriod = {
        id: 'per-1',
        employmentRelationshipId: 'rel-1',
        year: pastYear,
        month: pastMonth,
        periodType: PeriodType.MONTHLY,
        status: PayrollPeriodStatus.OPEN,
        fromDate: new Date('2025-05-01T00:00:00.000Z'),
        toDate: new Date('2025-05-31T00:00:00.000Z'),
        attendanceApprovedAt: null,
        attendanceApprovedByUserId: null,
        closedAt: null,
        closedByUserId: null,
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        relationship: activeRelationship,
        attendanceSnapshot: null,
      };

      prisma.payrollPeriod.findUnique.mockResolvedValue(openPeriod);

      const approvedWorkDays = [
        {
          id: 'wd-1',
          date: new Date('2025-05-05T00:00:00.000Z'),
          status: WorkDayStatus.APPROVED,
          approvedMinutes: 480,
          approvedAt: new Date('2025-05-05T18:00:00.000Z'),
          version: 2,
          timeEntries: [
            {
              kind: 'CLOCK_IN',
              status: 'APPROVED',
              declaredAt: new Date('2025-05-05T09:00:00.000Z'),
            },
            {
              kind: 'CLOCK_OUT',
              status: 'APPROVED',
              declaredAt: new Date('2025-05-05T17:00:00.000Z'),
            },
          ],
          corrections: [],
        },
        {
          id: 'wd-2',
          date: new Date('2025-05-07T00:00:00.000Z'),
          status: WorkDayStatus.APPROVED,
          approvedMinutes: 480,
          approvedAt: new Date('2025-05-07T18:00:00.000Z'),
          version: 2,
          timeEntries: [
            {
              kind: 'CLOCK_IN',
              status: 'APPROVED',
              declaredAt: new Date('2025-05-07T09:00:00.000Z'),
            },
            {
              kind: 'CLOCK_OUT',
              status: 'APPROVED',
              declaredAt: new Date('2025-05-07T17:00:00.000Z'),
            },
          ],
          corrections: [],
        },
      ];

      prisma.payrollPeriod.findUniqueOrThrow.mockResolvedValue(openPeriod);
      prisma.workDay.findMany.mockResolvedValue(approvedWorkDays);
      prisma.payrollPeriod.updateMany.mockResolvedValue({ count: 1 });

      const createdSnapshot = {
        id: 'snap-1',
        payrollPeriodId: 'per-1',
        schemaVersion: '1.0',
        approvedDays: 2,
        approvedMinutes: 960,
        hash: 'abc123sha256',
        createdAt: new Date(),
        createdByUserId: 'user-employer',
        payload: {},
      };
      prisma.periodAttendanceSnapshot.create.mockResolvedValue(createdSnapshot);

      const result = await service.closeAttendance(employerActor, 'per-1', { expectedVersion: 0 });

      expect(result.status).toBe('READY_FOR_CALCULATION');
      expect(result.attendance.approvedDays).toBe(2);
      expect(result.attendance.approvedMinutes).toBe(960);
      expect(prisma.periodAttendanceSnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            payrollPeriodId: 'per-1',
            approvedDays: 2,
            approvedMinutes: 960,
            schemaVersion: '1.0',
          }),
        }),
      );
      expect(prisma.workDay.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['wd-1', 'wd-2'] } },
        data: { payrollPeriodId: 'per-1' },
      });
      expect(audit.record).toHaveBeenCalled();
      expect(outbox.enqueueEmail).toHaveBeenCalled();
    });

    it('bloquea el cierre si el mes actual aún no ha finalizado (ATTENDANCE_PERIOD_NOT_FINISHED)', async () => {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      const unfinishedPeriod = {
        id: 'per-current',
        employmentRelationshipId: 'rel-1',
        year: currentYear,
        month: currentMonth,
        periodType: PeriodType.MONTHLY,
        status: PayrollPeriodStatus.OPEN,
        fromDate: new Date(
          `${currentYear}-${String(currentMonth).padStart(2, '0')}-01T00:00:00.000Z`,
        ),
        toDate: new Date(
          `${currentYear}-${String(currentMonth).padStart(2, '0')}-28T00:00:00.000Z`,
        ),
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        relationship: activeRelationship,
      };

      prisma.payrollPeriod.findUnique.mockResolvedValue(unfinishedPeriod);

      await expect(
        service.closeAttendance(employerActor, 'per-current', { expectedVersion: 0 }),
      ).rejects.toThrow(UnprocessableError);
    });

    it('bloquea el cierre si existen jornadas PENDING_APPROVAL', async () => {
      const openPeriod = {
        id: 'per-1',
        employmentRelationshipId: 'rel-1',
        year: pastYear,
        month: pastMonth,
        status: PayrollPeriodStatus.OPEN,
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        relationship: activeRelationship,
      };

      prisma.payrollPeriod.findUnique.mockResolvedValue(openPeriod);
      prisma.payrollPeriod.findUniqueOrThrow.mockResolvedValue(openPeriod);

      prisma.workDay.findMany.mockResolvedValue([
        {
          id: 'wd-1',
          date: new Date('2025-05-03T00:00:00.000Z'),
          status: WorkDayStatus.PENDING_APPROVAL,
          approvedMinutes: null,
          timeEntries: [],
          corrections: [],
        },
      ]);

      await expect(
        service.closeAttendance(employerActor, 'per-1', { expectedVersion: 0 }),
      ).rejects.toThrow(UnprocessableError);
    });

    it('bloquea el cierre si existen jornadas DISPUTED', async () => {
      const openPeriod = {
        id: 'per-1',
        employmentRelationshipId: 'rel-1',
        year: pastYear,
        month: pastMonth,
        status: PayrollPeriodStatus.OPEN,
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        relationship: activeRelationship,
      };

      prisma.payrollPeriod.findUnique.mockResolvedValue(openPeriod);
      prisma.payrollPeriod.findUniqueOrThrow.mockResolvedValue(openPeriod);

      prisma.workDay.findMany.mockResolvedValue([
        {
          id: 'wd-1',
          date: new Date('2025-05-03T00:00:00.000Z'),
          status: WorkDayStatus.DISPUTED,
          approvedMinutes: null,
          timeEntries: [],
          corrections: [{ id: 'c-1', status: 'PENDING' }],
        },
      ]);

      await expect(
        service.closeAttendance(employerActor, 'per-1', { expectedVersion: 0 }),
      ).rejects.toThrow(UnprocessableError);
    });

    it('bloquea el cierre si el período no tiene jornadas aprobadas', async () => {
      const openPeriod = {
        id: 'per-1',
        employmentRelationshipId: 'rel-1',
        year: pastYear,
        month: pastMonth,
        status: PayrollPeriodStatus.OPEN,
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        relationship: activeRelationship,
      };

      prisma.payrollPeriod.findUnique.mockResolvedValue(openPeriod);
      prisma.payrollPeriod.findUniqueOrThrow.mockResolvedValue(openPeriod);
      prisma.workDay.findMany.mockResolvedValue([]);

      await expect(
        service.closeAttendance(employerActor, 'per-1', { expectedVersion: 0 }),
      ).rejects.toThrow(UnprocessableError);
    });

    it('rechaza con 409 ResourceVersionConflictError si la versión cambió concurrentemente', async () => {
      const openPeriod = {
        id: 'per-1',
        employmentRelationshipId: 'rel-1',
        year: pastYear,
        month: pastMonth,
        status: PayrollPeriodStatus.OPEN,
        version: 2,
        relationship: activeRelationship,
      };

      prisma.payrollPeriod.findUnique.mockResolvedValue(openPeriod);

      await expect(
        service.closeAttendance(employerActor, 'per-1', { expectedVersion: 1 }),
      ).rejects.toThrow(ResourceVersionConflictError);
    });

    it('rechaza con ForbiddenError si la trabajadora intenta cerrar el período', async () => {
      const openPeriod = {
        id: 'per-1',
        employmentRelationshipId: 'rel-1',
        year: pastYear,
        month: pastMonth,
        status: PayrollPeriodStatus.OPEN,
        version: 0,
        relationship: activeRelationship,
      };

      prisma.payrollPeriod.findUnique.mockResolvedValue(openPeriod);

      await expect(
        service.closeAttendance(workerActor, 'per-1', { expectedVersion: 0 }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('rechaza con NotFoundError si un usuario ajeno intenta cerrar el período', async () => {
      const openPeriod = {
        id: 'per-1',
        employmentRelationshipId: 'rel-1',
        year: pastYear,
        month: pastMonth,
        status: PayrollPeriodStatus.OPEN,
        version: 0,
        relationship: activeRelationship,
      };

      prisma.payrollPeriod.findUnique.mockResolvedValue(openPeriod);

      await expect(
        service.closeAttendance(strangerActor, 'per-1', { expectedVersion: 0 }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('Read model de período cerrado', () => {
    it('sirve approvedDays y approvedMinutes exclusivamente desde el snapshot inmutable', async () => {
      const closedPeriodWithSnapshot = {
        id: 'per-closed',
        employmentRelationshipId: 'rel-1',
        year: 2025,
        month: 5,
        periodType: PeriodType.MONTHLY,
        status: PayrollPeriodStatus.READY_FOR_CALCULATION,
        fromDate: new Date('2025-05-01T00:00:00.000Z'),
        toDate: new Date('2025-05-31T00:00:00.000Z'),
        attendanceApprovedAt: new Date('2025-06-01T10:00:00.000Z'),
        attendanceApprovedByUserId: 'user-employer',
        closedAt: null,
        closedByUserId: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        relationship: activeRelationship,
        attendanceSnapshot: {
          id: 'snap-1',
          payrollPeriodId: 'per-closed',
          schemaVersion: '1.0',
          approvedDays: 15,
          approvedMinutes: 7200,
          hash: 'hash-inmutable-sha256',
          createdAt: new Date('2025-06-01T10:00:00.000Z'),
          createdByUserId: 'user-employer',
          payload: { schemaVersion: '1.0' },
        },
      };

      prisma.payrollPeriod.findUnique.mockResolvedValue(closedPeriodWithSnapshot);

      const view = await service.getById(employerActor, 'per-closed');

      expect(view.attendance.approvedDays).toBe(15);
      expect(view.attendance.approvedMinutes).toBe(7200);
      expect(view.attendance.openDays).toBe(0);
      expect(view.attendance.pendingApprovalDays).toBe(0);
      expect(view.attendance.disputedDays).toBe(0);
      expect(view.snapshot?.hash).toBe('hash-inmutable-sha256');
      // No debe consultar tablas vivas de workDay al estar cerrado
      expect(prisma.workDay.findMany).not.toHaveBeenCalled();
    });
  });
});
