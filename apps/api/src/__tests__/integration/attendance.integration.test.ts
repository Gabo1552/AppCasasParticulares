import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { PrismaClient, PlatformRole, WorkDayStatus, TimeEntryStatus } from '@casas/database';
import { ResourceVersionConflictError } from '@casas/domain';
import { TimeTrackingService } from '../../modules/time-tracking/time-tracking.service';
import { AttendanceCorrectionsService } from '../../modules/attendance-corrections/attendance-corrections.service';
import { AuditService } from '../../common/audit/audit.service';
import { OutboxNotificationService } from '../../modules/notifications/outbox-notification.service';
import { FieldEncryptionService } from '../../common/crypto/field-encryption.service';
import { loadAppConfig } from '../../config/app-config';
import type { AuthenticatedActor } from '../../common/auth/auth.types';

describe('Pruebas de Integración PostgreSQL — Fichaje, Corrección y Aprobación de Asistencia (E3.7–E3.8)', () => {
  let prismaEmployer: PrismaClient;
  let prismaWorker: PrismaClient;
  let timeTrackingEmployer: TimeTrackingService;
  let timeTrackingWorker: TimeTrackingService;
  let correctionsEmployer: AttendanceCorrectionsService;
  let correctionsWorker: AttendanceCorrectionsService;

  beforeAll(async () => {
    prismaEmployer = new PrismaClient();
    prismaWorker = new PrismaClient();
    await prismaEmployer.$connect();
    await prismaWorker.$connect();

    const config = loadAppConfig();
    const fieldEncryption = new FieldEncryptionService(config);
    const audit = new AuditService();
    const outbox = new OutboxNotificationService(fieldEncryption);

    timeTrackingEmployer = new TimeTrackingService(prismaEmployer as never, audit, outbox);
    timeTrackingWorker = new TimeTrackingService(prismaWorker as never, audit, outbox);
    correctionsEmployer = new AttendanceCorrectionsService(prismaEmployer as never, audit, outbox);
    correctionsWorker = new AttendanceCorrectionsService(prismaWorker as never, audit, outbox);
  });

  afterAll(async () => {
    await prismaEmployer?.$disconnect();
    await prismaWorker?.$disconnect();
  });

  async function createActiveRelationshipFixture() {
    const timestamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const userEmp = await prismaEmployer.user.create({
      data: { email: `emp-${timestamp}@example.com`, displayName: 'Familia Integracion' },
    });
    const userWrk = await prismaEmployer.user.create({
      data: { email: `wrk-${timestamp}@example.com`, displayName: 'Trabajadora Integracion' },
    });

    const empProfile = await prismaEmployer.employer.create({
      data: {
        userId: userEmp.id,
        firstName: 'Familia',
        lastName: 'Integracion',
        legalName: 'Familia Integracion',
      },
    });
    const wrkProfile = await prismaEmployer.worker.create({
      data: {
        userId: userWrk.id,
        firstName: 'Trabajadora',
        lastName: 'Integracion',
        legalName: 'Trabajadora Integracion',
      },
    });

    const household = await prismaEmployer.household.create({
      data: {
        employerId: empProfile.id,
        label: 'Casa Fichaje',
        street: 'Av. Santa Fe',
        streetNumber: '2000',
        city: 'CABA',
        province: 'CABA',
        postalCode: '1425',
        timezone: 'America/Argentina/Buenos_Aires',
      },
    });

    const relationship = await prismaEmployer.employmentRelationship.create({
      data: {
        employerId: empProfile.id,
        workerId: wrkProfile.id,
        householdId: household.id,
        startDate: new Date(),
        status: 'ACTIVE',
        version: 1,
      },
    });

    const employerActor: AuthenticatedActor = {
      userId: userEmp.id,
      sessionId: `sess-emp-${timestamp}`,
      roles: [PlatformRole.FAMILY_EMPLOYER],
      employerId: empProfile.id,
      workerId: null,
    };

    const workerActor: AuthenticatedActor = {
      userId: userWrk.id,
      sessionId: `sess-wrk-${timestamp}`,
      roles: [PlatformRole.WORKER],
      employerId: null,
      workerId: wrkProfile.id,
    };

    return {
      userEmp,
      userWrk,
      empProfile,
      wrkProfile,
      household,
      relationship,
      employerActor,
      workerActor,
    };
  }

  it('1. Flujo completo: entrada -> salida -> aprobación familiar con cálculo determinista de minutos', async () => {
    const { relationship, employerActor, workerActor } = await createActiveRelationshipFixture();

    // A. Trabajadora ficha entrada
    const clockInResult = await timeTrackingWorker.clockIn(
      workerActor,
      relationship.id,
      { method: 'BUTTON', declaredAt: '2026-09-01T08:00:00.000Z' },
      'idemp-clock-in-1',
    );

    expect(clockInResult.status).toBe('OPEN');
    expect(clockInResult.clockInAt).toBe('2026-09-01T08:00:00.000Z');
    expect(clockInResult.clockOutAt).toBeNull();

    // B. Trabajadora ficha salida (trabajó de 08:00 a 16:00 = 8 horas = 480 minutos)
    const clockOutResult = await timeTrackingWorker.clockOut(
      workerActor,
      clockInResult.id,
      { declaredAt: '2026-09-01T16:00:00.000Z' },
      'idemp-clock-out-1',
    );

    expect(clockOutResult.status).toBe('PENDING_APPROVAL');
    expect(clockOutResult.realMinutes).toBe(480);
    expect(clockOutResult.computableMinutes).toBe(480);

    // C. Familia aprueba la jornada
    const approvalResult = await timeTrackingEmployer.approve(employerActor, clockOutResult.id, {
      expectedVersion: clockOutResult.version,
    });

    expect(approvalResult.status).toBe('APPROVED');
    expect(approvalResult.approvedMinutes).toBe(480);
    expect(approvalResult.approvedAt).not.toBeNull();
    expect(approvalResult.approvedByUserId).toBe(employerActor.userId);

    // Verificar en la base de datos real
    const dbWorkDay = await prismaEmployer.workDay.findUnique({
      where: { id: clockOutResult.id },
      include: { timeEntries: true },
    });

    expect(dbWorkDay?.status).toBe(WorkDayStatus.APPROVED);
    expect(dbWorkDay?.approvedMinutes).toBe(480);
    expect(dbWorkDay?.timeEntries).toHaveLength(2);
    expect(dbWorkDay?.timeEntries.every((e) => e.status === TimeEntryStatus.APPROVED)).toBe(true);

    // Verificar auditoría persistida en PostgreSQL
    const auditEvents = await prismaEmployer.auditEvent.findMany({
      where: { entityId: clockOutResult.id },
    });
    expect(auditEvents.length).toBeGreaterThanOrEqual(3); // Clock-in, Clock-out, Approved
  });

  it('2. Concurrencia real: aprobación simultánea de la familia vs solicitud de corrección por la trabajadora', async () => {
    const { relationship, employerActor, workerActor } = await createActiveRelationshipFixture();

    // Crear jornada en PENDING_APPROVAL
    const inRes = await timeTrackingWorker.clockIn(
      workerActor,
      relationship.id,
      { method: 'BUTTON', declaredAt: '2026-09-02T08:00:00.000Z' },
      'idemp-in-2',
    );
    const outRes = await timeTrackingWorker.clockOut(
      workerActor,
      inRes.id,
      { declaredAt: '2026-09-02T16:00:00.000Z' },
      'idemp-out-2',
    );

    const observedVersion = outRes.version;

    // Ejecutar simultáneamente sobre dos conexiones PostgreSQL distintas
    const results = await Promise.allSettled([
      timeTrackingEmployer.approve(employerActor, outRes.id, { expectedVersion: observedVersion }),
      correctionsWorker.requestCorrection(workerActor, outRes.id, {
        reason: 'Salí a las 17:00 en realidad',
        proposedClockInAt: '2026-09-02T08:00:00.000Z',
        proposedClockOutAt: '2026-09-02T17:00:00.000Z',
        expectedVersion: observedVersion,
      }),
    ]);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    // Exactamente una gana, la otra recibe ResourceVersionConflictError (409)
    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);

    const failureReason = (failed[0] as PromiseRejectedResult).reason;
    expect(failureReason).toBeInstanceOf(ResourceVersionConflictError);

    // El estado en la base es consistente con la que ganó
    const finalWorkDay = await prismaEmployer.workDay.findUnique({
      where: { id: outRes.id },
      include: { corrections: true },
    });

    if (finalWorkDay?.status === WorkDayStatus.APPROVED) {
      expect(finalWorkDay.approvedMinutes).toBe(480);
    } else {
      expect(finalWorkDay?.status).toBe(WorkDayStatus.DISPUTED);
      expect(finalWorkDay?.corrections).toHaveLength(1);
    }
  });

  it('3. Flujo de corrección: trabajadora solicita corrección y familia la aprueba', async () => {
    const { relationship, employerActor, workerActor } = await createActiveRelationshipFixture();

    const inRes = await timeTrackingWorker.clockIn(
      workerActor,
      relationship.id,
      { method: 'BUTTON', declaredAt: '2026-09-03T09:00:00.000Z' },
      'idemp-in-3',
    );
    const outRes = await timeTrackingWorker.clockOut(
      workerActor,
      inRes.id,
      { declaredAt: '2026-09-03T15:00:00.000Z' }, // 6 horas
      'idemp-out-3',
    );

    // Trabajadora solicita corrección a 8 horas (09:00 a 17:00)
    const correctedDisputed = await correctionsWorker.requestCorrection(workerActor, outRes.id, {
      reason: 'Me quedé 2 horas extra acordadas',
      proposedClockInAt: '2026-09-03T09:00:00.000Z',
      proposedClockOutAt: '2026-09-03T17:00:00.000Z',
      expectedVersion: outRes.version,
    });

    expect(correctedDisputed.status).toBe('DISPUTED');
    const correctionId = correctedDisputed.corrections[0]!.id;

    // Familia aprueba la corrección
    const approvedCorrectionResult = await correctionsEmployer.approveCorrection(
      employerActor,
      outRes.id,
      correctionId,
      correctedDisputed.version,
    );

    expect(approvedCorrectionResult.status).toBe('APPROVED');
    expect(approvedCorrectionResult.approvedMinutes).toBe(480); // 8 horas = 480 min
    expect(approvedCorrectionResult.effectiveClockOutAt).toBe('2026-09-03T17:00:00.000Z');

    // Fichajes originales quedan marcados como CORRECTED y nuevos como APPROVED
    const dbEntries = await prismaEmployer.timeEntry.findMany({
      where: { workDayId: outRes.id },
      orderBy: { createdAt: 'asc' },
    });

    const correctedEntries = dbEntries.filter((e) => e.status === TimeEntryStatus.CORRECTED);
    const approvedEntries = dbEntries.filter((e) => e.status === TimeEntryStatus.APPROVED);

    expect(correctedEntries.length).toBe(2); // In y Out originales
    expect(approvedEntries.length).toBe(2); // In y Out corregidos
  });

  it('4. Idempotencia: dos llamadas con la misma clave devuelven el mismo registro sin duplicar', async () => {
    const { relationship, workerActor } = await createActiveRelationshipFixture();

    const [res1, res2] = await Promise.all([
      timeTrackingWorker.clockIn(workerActor, relationship.id, {
        method: 'BUTTON',
        declaredAt: '2026-09-04T08:30:00.000Z',
        clientIdempotencyKey: 'same-idemp-key-4',
      }),
      timeTrackingWorker.clockIn(workerActor, relationship.id, {
        method: 'BUTTON',
        declaredAt: '2026-09-04T08:30:00.000Z',
        clientIdempotencyKey: 'same-idemp-key-4',
      }),
    ]);

    expect(res1.id).toBe(res2.id);

    const count = await prismaEmployer.timeEntry.count({
      where: {
        employmentRelationshipId: relationship.id,
        clientIdempotencyKey: 'same-idemp-key-4',
      },
    });

    expect(count).toBe(1);
  });
});
