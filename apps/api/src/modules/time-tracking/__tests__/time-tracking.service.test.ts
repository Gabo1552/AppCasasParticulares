import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  ClockInMethod,
  EmploymentRelationshipStatus,
  PlatformRole,
  TimeEntryKind,
  TimeEntryStatus,
  WorkDayStatus,
} from '@casas/database';
import { ResourceVersionConflictError } from '@casas/domain';
import { TimeTrackingService, toAttendanceView } from '../time-tracking.service';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { AuditService } from '../../../common/audit/audit.service';
import type { OutboxNotificationService } from '../../notifications/outbox-notification.service';
import { ForbiddenError, NotFoundError, UnprocessableError } from '../../../common/http/app.errors';
import type { AuthenticatedActor } from '../../../common/auth/auth.types';

describe('TimeTrackingService (unit)', () => {
  let service: TimeTrackingService;
  let prisma: {
    employmentRelationship: { findUnique: ReturnType<typeof vi.fn> };
    timeEntry: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    workDay: {
      findUnique: ReturnType<typeof vi.fn>;
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    payrollPeriod: {
      findFirst: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
    $executeRawUnsafe?: ReturnType<typeof vi.fn>;
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
      employmentRelationship: {
        findUnique: vi.fn(),
      },
      timeEntry: {
        findUnique: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      workDay: {
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      payrollPeriod: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(prisma)),
      $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    };

    audit = {
      record: vi.fn().mockResolvedValue(undefined),
    };

    outbox = {
      enqueueEmail: vi.fn().mockResolvedValue(undefined),
    };

    service = new TimeTrackingService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      outbox as unknown as OutboxNotificationService,
    );
  });

  describe('clockIn', () => {
    it('permite fichar entrada en una relación activa usando timestamp del servidor', async () => {
      prisma.employmentRelationship.findUnique.mockResolvedValue(activeRelationship);
      prisma.timeEntry.findUnique.mockResolvedValue(null);
      prisma.workDay.findFirst.mockResolvedValue(null);
      prisma.workDay.findUnique.mockResolvedValue(null);

      const createdWorkDay = {
        id: 'wd-1',
        employmentRelationshipId: 'rel-1',
        date: new Date('2026-09-01T00:00:00.000Z'),
        status: WorkDayStatus.OPEN,
        realMinutes: 0,
        computableMinutes: 0,
        approvedMinutes: null,
        breakMinutes: 0,
        approvedAt: null,
        approvedByUserId: null,
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
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
        corrections: [],
      };

      prisma.workDay.create.mockResolvedValue(createdWorkDay);
      prisma.workDay.findUniqueOrThrow.mockResolvedValue(createdWorkDay);

      const result = await service.clockIn(
        workerActor,
        'rel-1',
        { method: 'BUTTON' },
        'idempotency-key-1',
      );

      expect(result.id).toBe('wd-1');
      expect(result.status).toBe('OPEN');
      expect(result.clockInAt).toBe('2026-09-01T09:00:00.000Z');
      expect(audit.record).toHaveBeenCalled();
    });

    it('persiste correctamente coordenadas con valor cero (lat=0, lng=0)', async () => {
      prisma.employmentRelationship.findUnique.mockResolvedValue(activeRelationship);
      prisma.timeEntry.findUnique.mockResolvedValue(null);
      prisma.workDay.findFirst.mockResolvedValue(null);
      prisma.workDay.findUnique.mockResolvedValue(null);

      const createdWorkDay = {
        id: 'wd-1',
        employmentRelationshipId: 'rel-1',
        date: new Date('2026-09-01T00:00:00.000Z'),
        status: WorkDayStatus.OPEN,
        realMinutes: 0,
        computableMinutes: 0,
        approvedMinutes: null,
        breakMinutes: 0,
        approvedAt: null,
        approvedByUserId: null,
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
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
        corrections: [],
      };

      prisma.workDay.create.mockResolvedValue(createdWorkDay);
      prisma.workDay.findUniqueOrThrow.mockResolvedValue(createdWorkDay);

      await service.clockIn(workerActor, 'rel-1', {
        method: 'BUTTON',
        location: { lat: 0, lng: 0, accuracyMeters: 10 },
      });

      expect(prisma.timeEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            geoLat: 0,
            geoLng: 0,
            geoAccuracyMeters: 10,
          }),
        }),
      );
    });

    it('rechaza el fichaje si la relación no está activa', async () => {
      prisma.employmentRelationship.findUnique.mockResolvedValue({
        ...activeRelationship,
        status: EmploymentRelationshipStatus.PENDING_CONFIGURATION,
      });

      await expect(service.clockIn(workerActor, 'rel-1', { method: 'BUTTON' })).rejects.toThrow(
        UnprocessableError,
      );
    });

    it('devuelve 404 NotFound si quien intenta fichar es un usuario ajeno a la relación', async () => {
      prisma.employmentRelationship.findUnique.mockResolvedValue(activeRelationship);

      await expect(service.clockIn(strangerActor, 'rel-1', { method: 'BUTTON' })).rejects.toThrow(
        NotFoundError,
      );
    });

    it('rechaza con Forbidden si la familia intenta fichar entrada en vez de la trabajadora', async () => {
      prisma.employmentRelationship.findUnique.mockResolvedValue(activeRelationship);

      await expect(service.clockIn(employerActor, 'rel-1', { method: 'BUTTON' })).rejects.toThrow(
        ForbiddenError,
      );
    });

    it('rechaza si ya existe una jornada abierta', async () => {
      prisma.employmentRelationship.findUnique.mockResolvedValue(activeRelationship);
      prisma.timeEntry.findUnique.mockResolvedValue(null);
      prisma.workDay.findFirst.mockResolvedValue({
        id: 'wd-open',
        status: WorkDayStatus.OPEN,
        timeEntries: [{ kind: TimeEntryKind.CLOCK_IN }],
      });

      await expect(service.clockIn(workerActor, 'rel-1', { method: 'BUTTON' })).rejects.toThrow(
        UnprocessableError,
      );
    });

    it('rechaza si se intenta hacer clockIn sobre una fecha que ya fue APPROVED', async () => {
      prisma.employmentRelationship.findUnique.mockResolvedValue(activeRelationship);
      prisma.timeEntry.findUnique.mockResolvedValue(null);
      prisma.workDay.findFirst.mockResolvedValue(null);
      prisma.workDay.findUnique.mockResolvedValue({
        id: 'wd-approved',
        status: WorkDayStatus.APPROVED,
      });

      await expect(service.clockIn(workerActor, 'rel-1', { method: 'BUTTON' })).rejects.toThrow(
        UnprocessableError,
      );
    });

    it('maneja retries idempotentes devolviendo la jornada existente sin duplicar', async () => {
      prisma.employmentRelationship.findUnique.mockResolvedValue(activeRelationship);
      const existingWorkDay = {
        id: 'wd-1',
        employmentRelationshipId: 'rel-1',
        date: new Date('2026-09-01T00:00:00.000Z'),
        status: WorkDayStatus.OPEN,
        realMinutes: 0,
        computableMinutes: 0,
        approvedMinutes: null,
        breakMinutes: 0,
        approvedAt: null,
        approvedByUserId: null,
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
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
        corrections: [],
      };

      prisma.timeEntry.findUnique.mockResolvedValue({
        id: 'te-1',
        workDay: existingWorkDay,
      });

      const result = await service.clockIn(workerActor, 'rel-1', {
        method: 'BUTTON',
        clientIdempotencyKey: 'dup-key',
      });

      expect(result.id).toBe('wd-1');
      expect(prisma.timeEntry.create).not.toHaveBeenCalled();
    });
  });

  describe('clockOut', () => {
    it('cierra la jornada abierta y calcula minutos correctamente con CAS', async () => {
      const openWorkDay = {
        id: 'wd-1',
        employmentRelationshipId: 'rel-1',
        date: new Date('2026-09-01T00:00:00.000Z'),
        status: WorkDayStatus.OPEN,
        realMinutes: 0,
        computableMinutes: 0,
        approvedMinutes: null,
        breakMinutes: 30,
        approvedAt: null,
        approvedByUserId: null,
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        relationship: activeRelationship,
        timeEntries: [
          {
            id: 'te-in',
            kind: TimeEntryKind.CLOCK_IN,
            status: TimeEntryStatus.RECORDED,
            declaredAt: new Date(Date.now() - 6 * 3600000), // 6 horas antes
            receivedAt: new Date(Date.now() - 6 * 3600000),
            method: ClockInMethod.BUTTON,
            timezone: 'America/Argentina/Buenos_Aires',
            note: null,
            correctsTimeEntryId: null,
            clientIdempotencyKey: 'in-key',
          },
        ],
        corrections: [],
      };

      prisma.workDay.findUnique.mockResolvedValue(openWorkDay);

      const closedWorkDay = {
        ...openWorkDay,
        status: WorkDayStatus.PENDING_APPROVAL,
        realMinutes: 360,
        computableMinutes: 330,
        version: 1,
        timeEntries: [
          ...openWorkDay.timeEntries,
          {
            id: 'te-out',
            kind: TimeEntryKind.CLOCK_OUT,
            status: TimeEntryStatus.RECORDED,
            declaredAt: new Date(),
            receivedAt: new Date(),
            method: ClockInMethod.BUTTON,
            timezone: 'America/Argentina/Buenos_Aires',
            note: null,
            correctsTimeEntryId: null,
            clientIdempotencyKey: 'out-key',
          },
        ],
      };

      prisma.workDay.findUniqueOrThrow.mockResolvedValue(closedWorkDay);

      const result = await service.clockOut(workerActor, 'wd-1', {}, 'out-key');

      expect(result.status).toBe('PENDING_APPROVAL');
      expect(result.realMinutes).toBe(360);
      expect(result.computableMinutes).toBe(330);
      expect(prisma.workDay.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wd-1', status: WorkDayStatus.OPEN },
        }),
      );
      expect(audit.record).toHaveBeenCalled();
      expect(outbox.enqueueEmail).toHaveBeenCalled();
    });

    it('devuelve 404 NotFound si un usuario ajeno intenta registrar clockOut', async () => {
      prisma.workDay.findUnique.mockResolvedValue({
        id: 'wd-1',
        status: WorkDayStatus.OPEN,
        relationship: activeRelationship,
        timeEntries: [],
        corrections: [],
      });

      await expect(service.clockOut(strangerActor, 'wd-1', {})).rejects.toThrow(NotFoundError);
    });

    it('rechaza la salida si la jornada ya estaba cerrada', async () => {
      prisma.workDay.findUnique.mockResolvedValue({
        id: 'wd-1',
        status: WorkDayStatus.PENDING_APPROVAL,
        relationship: activeRelationship,
        timeEntries: [],
        corrections: [],
      });

      await expect(service.clockOut(workerActor, 'wd-1', {})).rejects.toThrow(UnprocessableError);
    });
  });

  describe('approve', () => {
    it('la familia aprueba una jornada pendiente y approvedMinutes representa duración efectiva (sin descuento de break)', async () => {
      const now = Date.now();
      const inTime = new Date(now - 8 * 3600000);
      const outTime = new Date(now);

      const pendingWorkDay = {
        id: 'wd-1',
        employmentRelationshipId: 'rel-1',
        date: new Date('2026-09-01T00:00:00.000Z'),
        status: WorkDayStatus.PENDING_APPROVAL,
        realMinutes: 480,
        computableMinutes: 450, // break = 30m
        approvedMinutes: null,
        breakMinutes: 30,
        approvedAt: null,
        approvedByUserId: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        relationship: activeRelationship,
        timeEntries: [
          {
            id: 'te-in',
            kind: TimeEntryKind.CLOCK_IN,
            status: TimeEntryStatus.PENDING_APPROVAL,
            declaredAt: inTime,
            receivedAt: inTime,
            method: ClockInMethod.BUTTON,
            note: null,
            correctsTimeEntryId: null,
          },
          {
            id: 'te-out',
            kind: TimeEntryKind.CLOCK_OUT,
            status: TimeEntryStatus.PENDING_APPROVAL,
            declaredAt: outTime,
            receivedAt: outTime,
            method: ClockInMethod.BUTTON,
            note: null,
            correctsTimeEntryId: null,
          },
        ],
        corrections: [],
      };

      prisma.workDay.findUnique.mockResolvedValue(pendingWorkDay);

      const approvedWorkDay = {
        ...pendingWorkDay,
        status: WorkDayStatus.APPROVED,
        approvedMinutes: 480, // duración efectiva aprobada = 480 min (no 450)
        approvedAt: new Date(),
        approvedByUserId: 'employer-user-1',
        version: 2,
      };

      prisma.workDay.findUniqueOrThrow.mockResolvedValue(approvedWorkDay);

      const result = await service.approve(employerActor, 'wd-1', { expectedVersion: 1 });

      expect(result.status).toBe('APPROVED');
      expect(result.approvedMinutes).toBe(480);
      expect(prisma.workDay.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'wd-1',
            status: WorkDayStatus.PENDING_APPROVAL,
            version: 1,
          },
          data: expect.objectContaining({
            status: WorkDayStatus.APPROVED,
            approvedMinutes: 480,
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalled();
      expect(outbox.enqueueEmail).toHaveBeenCalled();
    });

    it('rechaza aprobar directamente una jornada en estado DISPUTED', async () => {
      prisma.workDay.findUnique.mockResolvedValue({
        id: 'wd-1',
        status: WorkDayStatus.DISPUTED,
        version: 1,
        relationship: activeRelationship,
        timeEntries: [],
        corrections: [],
      });

      await expect(service.approve(employerActor, 'wd-1', { expectedVersion: 1 })).rejects.toThrow(
        UnprocessableError,
      );
    });

    it('rechaza aprobar si existe una corrección pendiente de resolución', async () => {
      prisma.workDay.findUnique.mockResolvedValue({
        id: 'wd-1',
        status: WorkDayStatus.PENDING_APPROVAL,
        version: 1,
        relationship: activeRelationship,
        timeEntries: [
          {
            kind: TimeEntryKind.CLOCK_IN,
            declaredAt: new Date(),
            status: TimeEntryStatus.PENDING_APPROVAL,
          },
          {
            kind: TimeEntryKind.CLOCK_OUT,
            declaredAt: new Date(),
            status: TimeEntryStatus.PENDING_APPROVAL,
          },
        ],
        corrections: [{ id: 'c-1', status: 'PENDING' }],
      });

      await expect(service.approve(employerActor, 'wd-1', { expectedVersion: 1 })).rejects.toThrow(
        UnprocessableError,
      );
    });

    it('rechaza aprobar una jornada incompleta sin fichaje de entrada o salida', async () => {
      prisma.workDay.findUnique.mockResolvedValue({
        id: 'wd-1',
        status: WorkDayStatus.PENDING_APPROVAL,
        version: 1,
        relationship: activeRelationship,
        timeEntries: [
          {
            kind: TimeEntryKind.CLOCK_IN,
            declaredAt: new Date(),
            status: TimeEntryStatus.PENDING_APPROVAL,
          },
        ],
        corrections: [],
      });

      await expect(service.approve(employerActor, 'wd-1', { expectedVersion: 1 })).rejects.toThrow(
        UnprocessableError,
      );
    });

    it('rechaza con 409 RESOURCE_VERSION_CONFLICT si la versión es stale', async () => {
      prisma.workDay.findUnique.mockResolvedValue({
        id: 'wd-1',
        status: WorkDayStatus.PENDING_APPROVAL,
        version: 2,
        relationship: activeRelationship,
        timeEntries: [
          {
            kind: TimeEntryKind.CLOCK_IN,
            declaredAt: new Date(),
            status: TimeEntryStatus.PENDING_APPROVAL,
          },
          {
            kind: TimeEntryKind.CLOCK_OUT,
            declaredAt: new Date(),
            status: TimeEntryStatus.PENDING_APPROVAL,
          },
        ],
        corrections: [],
      });

      await expect(service.approve(employerActor, 'wd-1', { expectedVersion: 1 })).rejects.toThrow(
        ResourceVersionConflictError,
      );
    });

    it('devuelve 404 NotFound si un usuario ajeno intenta aprobar', async () => {
      prisma.workDay.findUnique.mockResolvedValue({
        id: 'wd-1',
        status: WorkDayStatus.PENDING_APPROVAL,
        version: 1,
        relationship: activeRelationship,
        timeEntries: [],
        corrections: [],
      });

      await expect(service.approve(strangerActor, 'wd-1', { expectedVersion: 1 })).rejects.toThrow(
        NotFoundError,
      );
    });

    it('rechaza si la trabajadora asignada intenta autoaprobarse la jornada', async () => {
      prisma.workDay.findUnique.mockResolvedValue({
        id: 'wd-1',
        status: WorkDayStatus.PENDING_APPROVAL,
        version: 1,
        relationship: activeRelationship,
        timeEntries: [],
        corrections: [],
      });

      await expect(service.approve(workerActor, 'wd-1', { expectedVersion: 1 })).rejects.toThrow(
        ForbiddenError,
      );
    });
  });

  describe('toAttendanceView DTO serialization', () => {
    it('serializa timestamps estrictos sin fabricar fechas arbitrarias', () => {
      const now = new Date('2026-09-01T12:00:00.000Z');
      const workDay = {
        id: 'wd-1',
        employmentRelationshipId: 'rel-1',
        date: new Date('2026-09-01T00:00:00.000Z'),
        status: WorkDayStatus.OPEN,
        realMinutes: 0,
        computableMinutes: 0,
        approvedMinutes: null,
        breakMinutes: 0,
        approvedAt: null,
        approvedByUserId: null,
        version: 0,
        createdAt: now,
        updatedAt: now,
        relationship: activeRelationship,
        timeEntries: [
          {
            id: 'te-1',
            kind: TimeEntryKind.CLOCK_IN,
            status: TimeEntryStatus.RECORDED,
            declaredAt: now,
            receivedAt: now,
            method: ClockInMethod.BUTTON,
            note: null,
            correctsTimeEntryId: null,
          },
        ],
        corrections: [],
      };

      const view = toAttendanceView(workDay as never);

      expect(view.entries[0]!.declaredAt).toBe('2026-09-01T12:00:00.000Z');
      expect(view.entries[0]!.receivedAt).toBe('2026-09-01T12:00:00.000Z');
      expect(view.clockOutAt).toBeNull();
      expect(view.approvedAt).toBeNull();
    });
  });
});
