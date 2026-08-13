import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { PrismaClient, PlatformRole, WorkDayStatus, TimeEntryStatus } from '@casas/database';
import { ResourceVersionConflictError } from '@casas/domain';
import { TimeTrackingService } from '../../modules/time-tracking/time-tracking.service';
import { AttendanceCorrectionsService } from '../../modules/attendance-corrections/attendance-corrections.service';
import { AuditService } from '../../common/audit/audit.service';
import { OutboxNotificationService } from '../../modules/notifications/outbox-notification.service';
import { FieldEncryptionService } from '../../common/crypto/field-encryption.service';
import { loadAppConfig } from '../../config/app-config';
import { NotFoundError, UnprocessableError } from '../../common/http/app.errors';
import type { AuthenticatedActor } from '../../common/auth/auth.types';

describe('Pruebas de Integración PostgreSQL — Fichaje, Corrección y Aprobación de Asistencia (E3.7–E3.8)', () => {
  let prismaEmployer: PrismaClient;
  let prismaWorker: PrismaClient;
  let prismaWorker2: PrismaClient;
  let timeTrackingEmployer: TimeTrackingService;
  let timeTrackingWorker: TimeTrackingService;
  let timeTrackingWorker2: TimeTrackingService;
  let correctionsEmployer: AttendanceCorrectionsService;
  let correctionsWorker: AttendanceCorrectionsService;

  beforeAll(async () => {
    prismaEmployer = new PrismaClient();
    prismaWorker = new PrismaClient();
    prismaWorker2 = new PrismaClient();
    await prismaEmployer.$connect();
    await prismaWorker.$connect();
    await prismaWorker2.$connect();

    const config = loadAppConfig();
    const fieldEncryption = new FieldEncryptionService(config);
    const audit = new AuditService();
    const outbox = new OutboxNotificationService(fieldEncryption);

    timeTrackingEmployer = new TimeTrackingService(prismaEmployer as never, audit, outbox);
    timeTrackingWorker = new TimeTrackingService(prismaWorker as never, audit, outbox);
    timeTrackingWorker2 = new TimeTrackingService(prismaWorker2 as never, audit, outbox);
    correctionsEmployer = new AttendanceCorrectionsService(prismaEmployer as never, audit, outbox);
    correctionsWorker = new AttendanceCorrectionsService(prismaWorker as never, audit, outbox);
  });

  afterAll(async () => {
    await prismaEmployer?.$disconnect();
    await prismaWorker?.$disconnect();
    await prismaWorker2?.$disconnect();
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

  it('1. Flujo completo: entrada -> salida -> aprobación familiar con servidor como autoridad de tiempo', async () => {
    const { relationship, employerActor, workerActor } = await createActiveRelationshipFixture();

    const tBefore = Date.now() - 2000;

    // A. Trabajadora ficha entrada
    const clockInResult = await timeTrackingWorker.clockIn(
      workerActor,
      relationship.id,
      { method: 'BUTTON', location: { lat: 0, lng: 0, accuracyMeters: 5 } },
      'idemp-clock-in-1',
    );

    expect(clockInResult.status).toBe('OPEN');
    expect(clockInResult.clockInAt).not.toBeNull();
    expect(new Date(clockInResult.clockInAt!).getTime()).toBeGreaterThanOrEqual(tBefore);
    expect(clockInResult.clockOutAt).toBeNull();

    // Simular que pasaron horas en la base de datos ajustando el fichaje de entrada
    const inDate = new Date(Date.now() - 8 * 3600000);
    await prismaEmployer.timeEntry.updateMany({
      where: { workDayId: clockInResult.id, kind: 'CLOCK_IN' },
      data: { declaredAt: inDate, receivedAt: inDate },
    });

    // B. Trabajadora ficha salida
    const clockOutResult = await timeTrackingWorker.clockOut(
      workerActor,
      clockInResult.id,
      {},
      'idemp-clock-out-1',
    );

    expect(clockOutResult.status).toBe('PENDING_APPROVAL');
    expect(clockOutResult.realMinutes).toBeGreaterThanOrEqual(479);
    expect(clockOutResult.computableMinutes).toBeGreaterThanOrEqual(479);

    // C. Familia aprueba la jornada
    const approvalResult = await timeTrackingEmployer.approve(employerActor, clockOutResult.id, {
      expectedVersion: clockOutResult.version,
    });

    expect(approvalResult.status).toBe('APPROVED');
    expect(approvalResult.approvedMinutes).toBeGreaterThanOrEqual(479);
    expect(approvalResult.approvedAt).not.toBeNull();
    expect(approvalResult.approvedByUserId).toBe(employerActor.userId);

    // Verificar en la base de datos real
    const dbWorkDay = await prismaEmployer.workDay.findUnique({
      where: { id: clockOutResult.id },
      include: { timeEntries: true },
    });

    expect(dbWorkDay?.status).toBe(WorkDayStatus.APPROVED);
    expect(dbWorkDay?.timeEntries).toHaveLength(2);
    expect(dbWorkDay?.timeEntries.every((e) => e.status === TimeEntryStatus.APPROVED)).toBe(true);

    // Verificar geolocalización preservada con coordenadas (0, 0)
    const dbInEntry = dbWorkDay?.timeEntries.find((e) => e.kind === 'CLOCK_IN');
    expect(Number(dbInEntry?.geoLat)).toBe(0);
    expect(Number(dbInEntry?.geoLng)).toBe(0);

    // Verificar auditoría persistida en PostgreSQL
    const auditEvents = await prismaEmployer.auditEvent.findMany({
      where: { entityId: clockOutResult.id },
    });
    expect(auditEvents.length).toBeGreaterThanOrEqual(3);
  });

  it('2. Concurrencia real P0: Dos clock-in simultáneos con claves distintas sólo permiten una jornada abierta', async () => {
    const { relationship, workerActor } = await createActiveRelationshipFixture();

    const results = await Promise.allSettled([
      timeTrackingWorker.clockIn(
        workerActor,
        relationship.id,
        { method: 'BUTTON' },
        'key-concurrent-in-a',
      ),
      timeTrackingWorker2.clockIn(
        workerActor,
        relationship.id,
        { method: 'BUTTON' },
        'key-concurrent-in-b',
      ),
    ]);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    // Exactamente 1 triunfa y 1 falla
    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);

    const failureReason = (failed[0] as PromiseRejectedResult).reason;
    expect(failureReason).toBeInstanceOf(UnprocessableError);

    // En la base de datos sólo existe 1 WorkDay y 1 TimeEntry para esta relación
    const workDays = await prismaEmployer.workDay.findMany({
      where: { employmentRelationshipId: relationship.id },
      include: { timeEntries: true },
    });

    expect(workDays).toHaveLength(1);
    expect(workDays[0]?.status).toBe(WorkDayStatus.OPEN);
    expect(workDays[0]?.timeEntries).toHaveLength(1);
  });

  it('3. Concurrencia real P0: Dos clock-out simultáneos con claves distintas sólo permiten un cierre', async () => {
    const { relationship, workerActor } = await createActiveRelationshipFixture();

    const inRes = await timeTrackingWorker.clockIn(
      workerActor,
      relationship.id,
      { method: 'BUTTON' },
      'key-in-single',
    );

    const results = await Promise.allSettled([
      timeTrackingWorker.clockOut(workerActor, inRes.id, {}, 'key-out-a'),
      timeTrackingWorker2.clockOut(workerActor, inRes.id, {}, 'key-out-b'),
    ]);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);

    const failureReason = (failed[0] as PromiseRejectedResult).reason;
    expect(failureReason).toBeInstanceOf(UnprocessableError);

    const dbWorkDay = await prismaEmployer.workDay.findUnique({
      where: { id: inRes.id },
      include: { timeEntries: true },
    });

    expect(dbWorkDay?.status).toBe(WorkDayStatus.PENDING_APPROVAL);
    const clockOuts = dbWorkDay?.timeEntries.filter((e) => e.kind === 'CLOCK_OUT');
    expect(clockOuts).toHaveLength(1);
  });

  it('4. Concurrencia real: aprobación simultánea de la familia vs solicitud de corrección por la trabajadora', async () => {
    const { relationship, employerActor, workerActor } = await createActiveRelationshipFixture();

    const inRes = await timeTrackingWorker.clockIn(
      workerActor,
      relationship.id,
      { method: 'BUTTON' },
      'idemp-in-race-2',
    );
    const outRes = await timeTrackingWorker.clockOut(workerActor, inRes.id, {}, 'idemp-out-race-2');

    const observedVersion = outRes.version;

    // Ejecutar simultáneamente sobre dos conexiones PostgreSQL distintas
    const results = await Promise.allSettled([
      timeTrackingEmployer.approve(employerActor, outRes.id, { expectedVersion: observedVersion }),
      correctionsWorker.requestCorrection(workerActor, outRes.id, {
        reason: 'Salí a las 17:00 en realidad',
        proposedClockInAt: inRes.clockInAt!,
        proposedClockOutAt: new Date(Date.now() + 3600000).toISOString(),
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

    const finalWorkDay = await prismaEmployer.workDay.findUnique({
      where: { id: outRes.id },
      include: { corrections: true },
    });

    if (finalWorkDay?.status === WorkDayStatus.APPROVED) {
      expect(finalWorkDay.approvedMinutes).not.toBeNull();
    } else {
      expect(finalWorkDay?.status).toBe(WorkDayStatus.DISPUTED);
      expect(finalWorkDay?.corrections).toHaveLength(1);
    }
  });

  it('5. Invariante P0: No se puede aprobar normalmente una jornada en estado DISPUTED', async () => {
    const { relationship, employerActor, workerActor } = await createActiveRelationshipFixture();

    const inRes = await timeTrackingWorker.clockIn(
      workerActor,
      relationship.id,
      { method: 'BUTTON' },
      'in-disputed-test',
    );
    const outRes = await timeTrackingWorker.clockOut(
      workerActor,
      inRes.id,
      {},
      'out-disputed-test',
    );

    const disputed = await correctionsWorker.requestCorrection(workerActor, outRes.id, {
      reason: 'Ajuste de horario',
      proposedClockInAt: inRes.clockInAt!,
      proposedClockOutAt: new Date(Date.now() + 7200000).toISOString(),
      expectedVersion: outRes.version,
    });

    expect(disputed.status).toBe('DISPUTED');

    await expect(
      timeTrackingEmployer.approve(employerActor, outRes.id, {
        expectedVersion: disputed.version,
      }),
    ).rejects.toThrow(UnprocessableError);
  });

  it('6. Invariante P0: Una jornada APPROVED nunca se reabre con clock-in', async () => {
    const { relationship, employerActor, workerActor } = await createActiveRelationshipFixture();

    const inRes = await timeTrackingWorker.clockIn(
      workerActor,
      relationship.id,
      { method: 'BUTTON' },
      'in-approve-reopen',
    );
    const outRes = await timeTrackingWorker.clockOut(
      workerActor,
      inRes.id,
      {},
      'out-approve-reopen',
    );
    const approved = await timeTrackingEmployer.approve(employerActor, outRes.id, {
      expectedVersion: outRes.version,
    });

    expect(approved.status).toBe('APPROVED');

    await expect(
      timeTrackingWorker.clockIn(
        workerActor,
        relationship.id,
        { method: 'BUTTON' },
        'in-attempt-reopen',
      ),
    ).rejects.toThrow(UnprocessableError);

    const dbWorkDay = await prismaEmployer.workDay.findUnique({
      where: { id: approved.id },
    });
    expect(dbWorkDay?.status).toBe(WorkDayStatus.APPROVED);
  });

  it('7. Invariante P1: Privacidad cross-tenant devuelve 404', async () => {
    const fixture1 = await createActiveRelationshipFixture();
    const fixture2 = await createActiveRelationshipFixture();

    const inRes1 = await timeTrackingWorker.clockIn(
      fixture1.workerActor,
      fixture1.relationship.id,
      { method: 'BUTTON' },
      'in-tenant-1',
    );

    // Usuario de fixture 2 intenta acceder al workday o relacion de fixture 1 -> 404
    await expect(timeTrackingWorker.getById(fixture2.workerActor, inRes1.id)).rejects.toThrow(
      NotFoundError,
    );
    await expect(
      timeTrackingEmployer.approve(fixture2.employerActor, inRes1.id, { expectedVersion: 0 }),
    ).rejects.toThrow(NotFoundError);
  });

  it('8. Idempotencia: dos llamadas con la misma clave devuelven el mismo registro sin duplicar', async () => {
    const { relationship, workerActor } = await createActiveRelationshipFixture();

    const [res1, res2] = await Promise.all([
      timeTrackingWorker.clockIn(workerActor, relationship.id, {
        method: 'BUTTON',
        clientIdempotencyKey: 'same-idemp-key-4',
      }),
      timeTrackingWorker.clockIn(workerActor, relationship.id, {
        method: 'BUTTON',
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

  it('9. Ciclo de corrección: trabajadora solicita corrección y familia la aprueba', async () => {
    const { relationship, employerActor, workerActor } = await createActiveRelationshipFixture();

    const inRes = await timeTrackingWorker.clockIn(
      workerActor,
      relationship.id,
      { method: 'BUTTON' },
      'in-corr-flow',
    );
    const outRes = await timeTrackingWorker.clockOut(workerActor, inRes.id, {}, 'out-corr-flow');

    const disputed = await correctionsWorker.requestCorrection(workerActor, outRes.id, {
      reason: 'Ajuste de horario acordado',
      proposedClockInAt: inRes.clockInAt!,
      proposedClockOutAt: new Date(Date.now() + 3600000).toISOString(),
      expectedVersion: outRes.version,
    });

    expect(disputed.status).toBe('DISPUTED');
    const correctionId = disputed.corrections[0]!.id;

    const approved = await correctionsEmployer.approveCorrection(
      employerActor,
      outRes.id,
      correctionId,
      disputed.version,
    );

    expect(approved.status).toBe('APPROVED');
    expect(approved.approvedMinutes).toBeGreaterThanOrEqual(59);
  });

  it('10. Idempotencia concurrente con misma clave en clock-out: dos clientes concurrentes obtienen la misma jornada cerrada', async () => {
    const { relationship, workerActor } = await createActiveRelationshipFixture();

    const inRes = await timeTrackingWorker.clockIn(
      workerActor,
      relationship.id,
      { method: 'BUTTON' },
      'in-idemp-concurrent-out',
    );

    const [out1, out2] = await Promise.all([
      timeTrackingWorker.clockOut(workerActor, inRes.id, {
        clientIdempotencyKey: 'same-out-key-10',
      }),
      timeTrackingWorker2.clockOut(workerActor, inRes.id, {
        clientIdempotencyKey: 'same-out-key-10',
      }),
    ]);

    expect(out1.id).toBe(inRes.id);
    expect(out2.id).toBe(inRes.id);
    expect(out1.status).toBe(WorkDayStatus.PENDING_APPROVAL);
    expect(out2.status).toBe(WorkDayStatus.PENDING_APPROVAL);

    const clockOutEntriesCount = await prismaEmployer.timeEntry.count({
      where: {
        employmentRelationshipId: relationship.id,
        clientIdempotencyKey: 'same-out-key-10',
      },
    });

    expect(clockOutEntriesCount).toBe(1);
  });

  it('11. Invariante: No se puede aprobar una jornada incompleta sin entrada y salida', async () => {
    const { relationship, employerActor } = await createActiveRelationshipFixture();

    // Crear directamente una jornada PENDING_APPROVAL sin timeEntries en PostgreSQL
    const incompleteWorkDay = await prismaEmployer.workDay.create({
      data: {
        employmentRelationshipId: relationship.id,
        date: new Date('2026-09-10T00:00:00.000Z'),
        status: WorkDayStatus.PENDING_APPROVAL,
        version: 1,
        realMinutes: 0,
        computableMinutes: 0,
      },
    });

    await expect(
      timeTrackingEmployer.approve(employerActor, incompleteWorkDay.id, { expectedVersion: 1 }),
    ).rejects.toThrow(UnprocessableError);
  });
});
