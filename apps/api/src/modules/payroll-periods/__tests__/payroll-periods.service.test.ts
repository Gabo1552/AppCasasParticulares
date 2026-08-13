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
        { status: WorkDayStatus.APPROVED, approvedMinutes: 480 },
      ]);

      const result = await service.getOrCreate(workerActor, 'rel-1', { year: 2026, month: 8 });

      expect(result.id).toBe('per-1');
      expect(result.attendance.approvedDays).toBe(1);
      expect(result.attendance.approvedMinutes).toBe(480);
      expect(prisma.payrollPeriod.create).not.toHaveBeenCalled();
    });

    it('devuelve 404 NotFound si un usuario ajeno intenta acceder', async () => {
      prisma.employmentRelationship.findUnique.mockResolvedValue(activeRelationship);

      await expect(
        service.getOrCreate(strangerActor, 'rel-1', { year: 2026, month: 8 }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('closeAttendance', () => {
    it('la familia cierra la asistencia exitosamente y genera snapshot inmutable', async () => {
      const openPeriod = {
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

      prisma.payrollPeriod.findUnique.mockResolvedValue(openPeriod);

      const approvedWorkDays = [
        {
          id: 'wd-1',
          date: new Date('2026-08-03T00:00:00.000Z'),
          status: WorkDayStatus.APPROVED,
          approvedMinutes: 480,
          approvedAt: new Date('2026-08-03T18:00:00.000Z'),
          version: 2,
          timeEntries: [
            {
              kind: 'CLOCK_IN',
              status: 'APPROVED',
              declaredAt: new Date('2026-08-03T09:00:00.000Z'),
            },
            {
              kind: 'CLOCK_OUT',
              status: 'APPROVED',
              declaredAt: new Date('2026-08-03T17:00:00.000Z'),
            },
          ],
          corrections: [],
        },
        {
          id: 'wd-2',
          date: new Date('2026-08-05T00:00:00.000Z'),
          status: WorkDayStatus.APPROVED,
          approvedMinutes: 480,
          approvedAt: new Date('2026-08-05T18:00:00.000Z'),
          version: 2,
          timeEntries: [
            {
              kind: 'CLOCK_IN',
              status: 'APPROVED',
              declaredAt: new Date('2026-08-05T09:00:00.000Z'),
            },
            {
              kind: 'CLOCK_OUT',
              status: 'APPROVED',
              declaredAt: new Date('2026-08-05T17:00:00.000Z'),
            },
          ],
          corrections: [],
        },
      ];

      prisma.workDay.findMany.mockResolvedValue(approvedWorkDays);
      prisma.payrollPeriod.updateMany.mockResolvedValue({ count: 1 });

      const closedPeriod = {
        ...openPeriod,
        status: PayrollPeriodStatus.READY_FOR_CALCULATION,
        attendanceApprovedAt: new Date(),
        attendanceApprovedByUserId: 'user-employer',
        version: 1,
        attendanceSnapshot: {
          id: 'snap-1',
          payrollPeriodId: 'per-1',
          schemaVersion: '1.0',
          approvedDays: 2,
          approvedMinutes: 960,
          hash: 'abc123sha256',
          createdAt: new Date(),
          createdByUserId: 'user-employer',
          payload: {},
        },
      };

      prisma.payrollPeriod.findUniqueOrThrow.mockResolvedValue(closedPeriod);

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

    it('bloquea el cierre si existen jornadas PENDING_APPROVAL', async () => {
      const openPeriod = {
        id: 'per-1',
        employmentRelationshipId: 'rel-1',
        year: 2026,
        month: 8,
        status: PayrollPeriodStatus.OPEN,
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        relationship: activeRelationship,
      };

      prisma.payrollPeriod.findUnique.mockResolvedValue(openPeriod);

      prisma.workDay.findMany.mockResolvedValue([
        {
          id: 'wd-1',
          date: new Date('2026-08-03T00:00:00.000Z'),
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
        year: 2026,
        month: 8,
        status: PayrollPeriodStatus.OPEN,
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        relationship: activeRelationship,
      };

      prisma.payrollPeriod.findUnique.mockResolvedValue(openPeriod);

      prisma.workDay.findMany.mockResolvedValue([
        {
          id: 'wd-1',
          date: new Date('2026-08-03T00:00:00.000Z'),
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
        year: 2026,
        month: 8,
        status: PayrollPeriodStatus.OPEN,
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        relationship: activeRelationship,
      };

      prisma.payrollPeriod.findUnique.mockResolvedValue(openPeriod);
      prisma.workDay.findMany.mockResolvedValue([]);

      await expect(
        service.closeAttendance(employerActor, 'per-1', { expectedVersion: 0 }),
      ).rejects.toThrow(UnprocessableError);
    });

    it('rechaza con 409 ResourceVersionConflictError si la versión cambió concurrentemente', async () => {
      const openPeriod = {
        id: 'per-1',
        employmentRelationshipId: 'rel-1',
        year: 2026,
        month: 8,
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
        year: 2026,
        month: 8,
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
        year: 2026,
        month: 8,
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
});
