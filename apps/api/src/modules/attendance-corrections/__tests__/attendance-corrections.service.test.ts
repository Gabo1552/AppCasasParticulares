import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  AttendanceCorrectionStatus,
  ClockInMethod,
  EmploymentRelationshipStatus,
  PlatformRole,
  TimeEntryKind,
  TimeEntryStatus,
  WorkDayStatus,
} from '@casas/database';
import { ResourceVersionConflictError } from '@casas/domain';
import { AttendanceCorrectionsService } from '../attendance-corrections.service';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { AuditService } from '../../../common/audit/audit.service';
import type { OutboxNotificationService } from '../../notifications/outbox-notification.service';
import { ForbiddenError } from '../../../common/http/app.errors';
import type { AuthenticatedActor } from '../../../common/auth/auth.types';

describe('AttendanceCorrectionsService (unit)', () => {
  let service: AttendanceCorrectionsService;
  let prisma: {
    workDay: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    timeEntry: {
      create: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    attendanceCorrection: {
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let audit: { record: ReturnType<typeof vi.fn> };
  let outbox: { enqueueEmail: ReturnType<typeof vi.fn> };

  const workerActor: AuthenticatedActor = {
    userId: 'worker-user-1',
    roles: [PlatformRole.WORKER],
    sessionId: 'session-1',
    employerId: null,
    workerId: 'w-1',
  };

  const employerActor: AuthenticatedActor = {
    userId: 'employer-user-1',
    roles: [PlatformRole.FAMILY_EMPLOYER],
    sessionId: 'session-2',
    employerId: 'e-1',
    workerId: null,
  };

  const strangerActor: AuthenticatedActor = {
    userId: 'stranger-user-1',
    roles: [PlatformRole.WORKER],
    sessionId: 'session-3',
    employerId: null,
    workerId: 'w-stranger',
  };

  const activeRelationship = {
    id: 'rel-1',
    status: EmploymentRelationshipStatus.ACTIVE,
    worker: { id: 'w-1', userId: 'worker-user-1', user: { email: 'worker@example.test' } },
    employer: { id: 'e-1', userId: 'employer-user-1', user: { email: 'employer@example.test' } },
    household: {
      id: 'h-1',
      label: 'Casa',
      city: 'CABA',
      timezone: 'America/Argentina/Buenos_Aires',
    },
  };

  beforeEach(() => {
    prisma = {
      workDay: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      timeEntry: {
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      attendanceCorrection: {
        create: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(prisma)),
    };

    audit = {
      record: vi.fn().mockResolvedValue(undefined),
    };

    outbox = {
      enqueueEmail: vi.fn().mockResolvedValue(undefined),
    };

    service = new AttendanceCorrectionsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      outbox as unknown as OutboxNotificationService,
    );
  });

  describe('requestCorrection', () => {
    it('la trabajadora solicita corrección con motivo y pasa la jornada a DISPUTED', async () => {
      const workDay = {
        id: 'wd-1',
        employmentRelationshipId: 'rel-1',
        date: new Date('2026-09-01T00:00:00.000Z'),
        status: WorkDayStatus.PENDING_APPROVAL,
        realMinutes: 360,
        computableMinutes: 360,
        approvedMinutes: null,
        breakMinutes: 0,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        relationship: activeRelationship,
        timeEntries: [
          {
            id: 'te-in',
            kind: TimeEntryKind.CLOCK_IN,
            status: TimeEntryStatus.RECORDED,
            declaredAt: new Date('2026-09-01T09:00:00.000Z'),
            receivedAt: new Date('2026-09-01T09:00:01.000Z'),
            method: ClockInMethod.BUTTON,
            note: null,
            correctsTimeEntryId: null,
          },
          {
            id: 'te-out',
            kind: TimeEntryKind.CLOCK_OUT,
            status: TimeEntryStatus.RECORDED,
            declaredAt: new Date('2026-09-01T15:00:00.000Z'),
            receivedAt: new Date('2026-09-01T15:00:01.000Z'),
            method: ClockInMethod.BUTTON,
            note: null,
            correctsTimeEntryId: null,
          },
        ],
        corrections: [],
      };

      prisma.workDay.findUnique.mockResolvedValue(workDay);

      const updatedWorkDay = {
        ...workDay,
        status: WorkDayStatus.DISPUTED,
        version: 2,
        corrections: [
          {
            id: 'corr-1',
            status: AttendanceCorrectionStatus.PENDING,
            requestedByUserId: 'worker-user-1',
            reason: 'Me olvidé de fichar salida a las 17:00',
            originalClockInAt: new Date('2026-09-01T09:00:00.000Z'),
            originalClockOutAt: new Date('2026-09-01T15:00:00.000Z'),
            proposedClockInAt: new Date('2026-09-01T09:00:00.000Z'),
            proposedClockOutAt: new Date('2026-09-01T17:00:00.000Z'),
            resolvedAt: null,
            resolvedByUserId: null,
            resolutionNote: null,
            createdAt: new Date(),
            version: 0,
          },
        ],
      };

      prisma.attendanceCorrection.create.mockResolvedValue({ id: 'corr-1' });
      prisma.workDay.update.mockResolvedValue(updatedWorkDay);

      const result = await service.requestCorrection(workerActor, 'wd-1', {
        reason: 'Me olvidé de fichar salida a las 17:00',
        proposedClockInAt: '2026-09-01T09:00:00.000Z',
        proposedClockOutAt: '2026-09-01T17:00:00.000Z',
        expectedVersion: 1,
      });

      expect(result.status).toBe('DISPUTED');
      expect(result.corrections).toHaveLength(1);
      expect(result.corrections[0]?.reason).toBe('Me olvidé de fichar salida a las 17:00');
      expect(audit.record).toHaveBeenCalled();
      expect(outbox.enqueueEmail).toHaveBeenCalled();
    });

    it('rechaza si la versión es stale (409)', async () => {
      prisma.workDay.findUnique.mockResolvedValue({
        id: 'wd-1',
        version: 3,
        relationship: activeRelationship,
        corrections: [],
        timeEntries: [],
      });

      await expect(
        service.requestCorrection(workerActor, 'wd-1', {
          reason: 'Ajuste',
          proposedClockInAt: '2026-09-01T09:00:00.000Z',
          proposedClockOutAt: '2026-09-01T17:00:00.000Z',
          expectedVersion: 2,
        }),
      ).rejects.toThrow(ResourceVersionConflictError);
    });

    it('rechaza si el usuario no es parte de la relación', async () => {
      prisma.workDay.findUnique.mockResolvedValue({
        id: 'wd-1',
        version: 1,
        relationship: activeRelationship,
        corrections: [],
        timeEntries: [],
      });

      await expect(
        service.requestCorrection(strangerActor, 'wd-1', {
          reason: 'Ajuste',
          proposedClockInAt: '2026-09-01T09:00:00.000Z',
          proposedClockOutAt: '2026-09-01T17:00:00.000Z',
          expectedVersion: 1,
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('approveCorrection', () => {
    it('la familia aprueba la corrección, genera fichajes corregidos y deja la jornada en APPROVED', async () => {
      const workDayWithPendingCorrection = {
        id: 'wd-1',
        employmentRelationshipId: 'rel-1',
        date: new Date('2026-09-01T00:00:00.000Z'),
        status: WorkDayStatus.DISPUTED,
        realMinutes: 360,
        computableMinutes: 360,
        approvedMinutes: null,
        breakMinutes: 0,
        version: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
        relationship: activeRelationship,
        timeEntries: [
          {
            id: 'te-1',
            kind: TimeEntryKind.CLOCK_IN,
            status: TimeEntryStatus.RECORDED,
            declaredAt: new Date('2026-09-01T09:00:00.000Z'),
            receivedAt: new Date('2026-09-01T09:00:01.000Z'),
            method: ClockInMethod.BUTTON,
            note: null,
            correctsTimeEntryId: null,
          },
        ],
        corrections: [
          {
            id: 'corr-1',
            status: AttendanceCorrectionStatus.PENDING,
            requestedByUserId: 'worker-user-1',
            reason: 'Salí a las 18:00',
            originalClockInAt: new Date('2026-09-01T09:00:00.000Z'),
            originalClockOutAt: new Date('2026-09-01T15:00:00.000Z'),
            proposedClockInAt: new Date('2026-09-01T09:00:00.000Z'),
            proposedClockOutAt: new Date('2026-09-01T18:00:00.000Z'),
            resolvedAt: null,
            resolvedByUserId: null,
            resolutionNote: null,
            createdAt: new Date(),
            version: 0,
          },
        ],
      };

      prisma.workDay.findUnique.mockResolvedValue(workDayWithPendingCorrection);

      const approvedWorkDay = {
        ...workDayWithPendingCorrection,
        status: WorkDayStatus.APPROVED,
        realMinutes: 540, // 9 horas
        computableMinutes: 540,
        approvedMinutes: 540,
        approvedAt: new Date(),
        approvedByUserId: 'employer-user-1',
        version: 3,
        corrections: [
          {
            ...workDayWithPendingCorrection.corrections[0],
            status: AttendanceCorrectionStatus.APPROVED,
            resolvedAt: new Date(),
            resolvedByUserId: 'employer-user-1',
          },
        ],
      };

      prisma.workDay.update.mockResolvedValue(approvedWorkDay);

      const result = await service.approveCorrection(employerActor, 'wd-1', 'corr-1', 2);

      expect(result.status).toBe('APPROVED');
      expect(result.approvedMinutes).toBe(540);
      expect(result.effectiveClockOutAt).toBe('2026-09-01T18:00:00.000Z');
      expect(audit.record).toHaveBeenCalled();
      expect(outbox.enqueueEmail).toHaveBeenCalled();
    });

    it('rechaza si quien aprueba no es la familia titular', async () => {
      prisma.workDay.findUnique.mockResolvedValue({
        id: 'wd-1',
        version: 1,
        relationship: activeRelationship,
        corrections: [{ id: 'corr-1', status: AttendanceCorrectionStatus.PENDING }],
      });

      await expect(service.approveCorrection(workerActor, 'wd-1', 'corr-1', 1)).rejects.toThrow(
        ForbiddenError,
      );
    });
  });

  describe('rejectCorrection', () => {
    it('la familia rechaza la corrección y revierte la jornada al estado previo', async () => {
      const workDay = {
        id: 'wd-1',
        employmentRelationshipId: 'rel-1',
        date: new Date('2026-09-01T00:00:00.000Z'),
        status: WorkDayStatus.DISPUTED,
        realMinutes: 360,
        computableMinutes: 360,
        approvedMinutes: null,
        breakMinutes: 0,
        version: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
        relationship: activeRelationship,
        timeEntries: [
          { kind: TimeEntryKind.CLOCK_IN, declaredAt: new Date('2026-09-01T09:00:00.000Z') },
          { kind: TimeEntryKind.CLOCK_OUT, declaredAt: new Date('2026-09-01T15:00:00.000Z') },
        ],
        corrections: [
          {
            id: 'corr-1',
            status: AttendanceCorrectionStatus.PENDING,
            requestedByUserId: 'worker-user-1',
            reason: 'Salí a las 18:00',
            proposedClockInAt: new Date('2026-09-01T09:00:00.000Z'),
            proposedClockOutAt: new Date('2026-09-01T18:00:00.000Z'),
            createdAt: new Date(),
            version: 0,
          },
        ],
      };

      prisma.workDay.findUnique.mockResolvedValue(workDay);

      const rejectedWorkDay = {
        ...workDay,
        status: WorkDayStatus.PENDING_APPROVAL,
        version: 3,
        corrections: [
          {
            ...workDay.corrections[0],
            status: AttendanceCorrectionStatus.REJECTED,
            resolvedAt: new Date(),
            resolvedByUserId: 'employer-user-1',
            resolutionNote: 'No coincide con lo acordado',
          },
        ],
      };

      prisma.workDay.update.mockResolvedValue(rejectedWorkDay);

      const result = await service.rejectCorrection(employerActor, 'wd-1', 'corr-1', {
        reason: 'No coincide con lo acordado',
        expectedVersion: 2,
      });

      expect(result.status).toBe('PENDING_APPROVAL');
      expect(result.corrections[0]?.status).toBe('REJECTED');
      expect(audit.record).toHaveBeenCalled();
      expect(outbox.enqueueEmail).toHaveBeenCalled();
    });
  });
});
