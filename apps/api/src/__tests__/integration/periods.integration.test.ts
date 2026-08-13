import { randomUUID } from 'node:crypto';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import {
  PrismaClient,
  PlatformRole,
  WorkDayStatus,
  TimeEntryKind,
  TimeEntryStatus,
  PayrollPeriodStatus,
} from '@casas/database';
import { ResourceVersionConflictError } from '@casas/domain';
import { PayrollPeriodsService } from '../../modules/payroll-periods/payroll-periods.service';
import { TimeTrackingService } from '../../modules/time-tracking/time-tracking.service';
import { AttendanceCorrectionsService } from '../../modules/attendance-corrections/attendance-corrections.service';
import { AuditService } from '../../common/audit/audit.service';
import { OutboxNotificationService } from '../../modules/notifications/outbox-notification.service';
import { FieldEncryptionService } from '../../common/crypto/field-encryption.service';
import { loadAppConfig } from '../../config/app-config';
import { ForbiddenError, NotFoundError, UnprocessableError } from '../../common/http/app.errors';
import type { AuthenticatedActor } from '../../common/auth/auth.types';

describe('Pruebas de Integración PostgreSQL — Período Mensual y Cierre de Asistencia (E3.9)', () => {
  let prismaEmployer1: PrismaClient;
  let prismaEmployer2: PrismaClient;
  let prismaWorker: PrismaClient;
  let prismaStranger: PrismaClient;

  let periodsServiceEmp1: PayrollPeriodsService;
  let periodsServiceEmp2: PayrollPeriodsService;
  let periodsServiceWorker: PayrollPeriodsService;
  let periodsServiceStranger: PayrollPeriodsService;

  let timeTrackingEmp: TimeTrackingService;
  let timeTrackingWorker: TimeTrackingService;
  let correctionsEmp: AttendanceCorrectionsService;
  let correctionsWorker: AttendanceCorrectionsService;

  beforeAll(async () => {
    prismaEmployer1 = new PrismaClient();
    prismaEmployer2 = new PrismaClient();
    prismaWorker = new PrismaClient();
    prismaStranger = new PrismaClient();

    await prismaEmployer1.$connect();
    await prismaEmployer2.$connect();
    await prismaWorker.$connect();
    await prismaStranger.$connect();

    const config = loadAppConfig();
    const fieldEncryption = new FieldEncryptionService(config);
    const audit = new AuditService();
    const outbox = new OutboxNotificationService(fieldEncryption);

    periodsServiceEmp1 = new PayrollPeriodsService(prismaEmployer1 as never, audit, outbox);
    periodsServiceEmp2 = new PayrollPeriodsService(prismaEmployer2 as never, audit, outbox);
    periodsServiceWorker = new PayrollPeriodsService(prismaWorker as never, audit, outbox);
    periodsServiceStranger = new PayrollPeriodsService(prismaStranger as never, audit, outbox);

    timeTrackingEmp = new TimeTrackingService(prismaEmployer1 as never, audit, outbox);
    timeTrackingWorker = new TimeTrackingService(prismaWorker as never, audit, outbox);
    correctionsEmp = new AttendanceCorrectionsService(prismaEmployer1 as never, audit, outbox);
    correctionsWorker = new AttendanceCorrectionsService(prismaWorker as never, audit, outbox);
  });

  afterAll(async () => {
    await prismaEmployer1?.$disconnect();
    await prismaEmployer2?.$disconnect();
    await prismaWorker?.$disconnect();
    await prismaStranger?.$disconnect();
  });

  async function createActiveRelationshipFixture() {
    const timestamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const userEmp = await prismaEmployer1.user.create({
      data: { email: `emp-${timestamp}@example.com`, displayName: 'Familia Períodos' },
    });
    const userWrk = await prismaEmployer1.user.create({
      data: { email: `wrk-${timestamp}@example.com`, displayName: 'Trabajadora Períodos' },
    });
    const userStranger = await prismaEmployer1.user.create({
      data: { email: `stranger-${timestamp}@example.com`, displayName: 'Usuario Ajeno' },
    });

    const empProfile = await prismaEmployer1.employer.create({
      data: {
        userId: userEmp.id,
        firstName: 'Familia',
        lastName: 'Períodos',
        legalName: 'Familia Períodos',
      },
    });
    const wrkProfile = await prismaEmployer1.worker.create({
      data: {
        userId: userWrk.id,
        firstName: 'Trabajadora',
        lastName: 'Períodos',
        legalName: 'Trabajadora Períodos',
      },
    });

    const household = await prismaEmployer1.household.create({
      data: {
        employerId: empProfile.id,
        label: 'Casa Períodos',
        street: 'Av. Belgrano',
        streetNumber: '1234',
        city: 'CABA',
        province: 'CABA',
        postalCode: '1092',
        timezone: 'America/Argentina/Buenos_Aires',
      },
    });

    const relationship = await prismaEmployer1.employmentRelationship.create({
      data: {
        employerId: empProfile.id,
        workerId: wrkProfile.id,
        householdId: household.id,
        startDate: new Date('2025-01-01T00:00:00.000Z'),
        status: 'ACTIVE',
        version: 1,
      },
    });

    const employerActor: AuthenticatedActor = {
      userId: userEmp.id,
      employerId: empProfile.id,
      workerId: null,
      roles: [PlatformRole.FAMILY_EMPLOYER],
      sessionId: `sess-emp-${timestamp}`,
    };

    const workerActor: AuthenticatedActor = {
      userId: userWrk.id,
      employerId: null,
      workerId: wrkProfile.id,
      roles: [PlatformRole.WORKER],
      sessionId: `sess-wrk-${timestamp}`,
    };

    const strangerActor: AuthenticatedActor = {
      userId: userStranger.id,
      employerId: 'emp-stranger',
      workerId: null,
      roles: [PlatformRole.FAMILY_EMPLOYER],
      sessionId: `sess-stranger-${timestamp}`,
    };

    return {
      relationship,
      employerActor,
      workerActor,
      strangerActor,
    };
  }

  async function createApprovedWorkDay(
    relationshipId: string,
    dateStr: string,
    minutes: number = 480,
  ) {
    const dateObj = new Date(`${dateStr}T00:00:00.000Z`);
    const clockInAt = new Date(`${dateStr}T09:00:00.000Z`);
    const clockOutAt = new Date(clockInAt.getTime() + minutes * 60000);

    const workDay = await prismaEmployer1.workDay.create({
      data: {
        employmentRelationshipId: relationshipId,
        date: dateObj,
        status: WorkDayStatus.APPROVED,
        approvedMinutes: minutes,
        realMinutes: minutes,
        computableMinutes: minutes,
        approvedAt: new Date(),
        version: 1,
        timeEntries: {
          create: [
            {
              employmentRelationshipId: relationshipId,
              clientIdempotencyKey: randomUUID(),
              kind: TimeEntryKind.CLOCK_IN,
              status: TimeEntryStatus.APPROVED,
              declaredAt: clockInAt,
              receivedAt: clockInAt,
              timezone: 'America/Argentina/Buenos_Aires',
              method: 'BUTTON',
            },
            {
              employmentRelationshipId: relationshipId,
              clientIdempotencyKey: randomUUID(),
              kind: TimeEntryKind.CLOCK_OUT,
              status: TimeEntryStatus.APPROVED,
              declaredAt: clockOutAt,
              receivedAt: clockOutAt,
              timezone: 'America/Argentina/Buenos_Aires',
              method: 'BUTTON',
            },
          ],
        },
      },
      include: {
        timeEntries: true,
      },
    });

    return workDay;
  }

  describe('1. Flujo completo de revisión y cierre de asistencia con snapshot SHA-256', () => {
    it('la familia revisa el resumen y cierra la asistencia de un mes finalizado creando snapshot inmutable', async () => {
      const fixture = await createActiveRelationshipFixture();

      // Creamos 3 jornadas aprobadas en mayo 2025 (mes finalizado)
      const d1 = await createApprovedWorkDay(fixture.relationship.id, '2025-05-05', 480);
      const d2 = await createApprovedWorkDay(fixture.relationship.id, '2025-05-07', 480);
      const d3 = await createApprovedWorkDay(fixture.relationship.id, '2025-05-09', 480);

      // 1. Obtener/Crear período de mayo 2025
      const period = await periodsServiceEmp1.getOrCreate(
        fixture.employerActor,
        fixture.relationship.id,
        { year: 2025, month: 5 },
      );

      expect(period.status).toBe('OPEN');
      expect(period.year).toBe(2025);
      expect(period.month).toBe(5);
      expect(period.attendance.approvedDays).toBe(3);
      expect(period.attendance.approvedMinutes).toBe(1440);
      expect(period.attendance.openDays).toBe(0);
      expect(period.attendance.pendingApprovalDays).toBe(0);
      expect(period.snapshot).toBeNull();

      // 2. Cerrar asistencia del período
      const closedView = await periodsServiceEmp1.closeAttendance(
        fixture.employerActor,
        period.id,
        { expectedVersion: period.version },
      );

      expect(closedView.status).toBe('READY_FOR_CALCULATION');
      expect(closedView.attendanceApprovedAt).not.toBeNull();
      expect(closedView.attendanceApprovedByUserId).toBe(fixture.employerActor.userId);
      expect(closedView.attendance.approvedDays).toBe(3);
      expect(closedView.attendance.approvedMinutes).toBe(1440);
      expect(closedView.snapshot).not.toBeNull();
      expect(closedView.snapshot?.schemaVersion).toBe('1.0');
      expect(closedView.snapshot?.approvedDays).toBe(3);
      expect(closedView.snapshot?.approvedMinutes).toBe(1440);
      expect(closedView.snapshot?.hash).toHaveLength(64); // SHA-256 hex string

      // 3. Verificar persistencia en base de datos
      const dbPeriod = await prismaEmployer1.payrollPeriod.findUniqueOrThrow({
        where: { id: period.id },
        include: { attendanceSnapshot: true, workDays: true },
      });

      expect(dbPeriod.status).toBe(PayrollPeriodStatus.READY_FOR_CALCULATION);
      expect(dbPeriod.attendanceSnapshot).not.toBeNull();
      expect(dbPeriod.attendanceSnapshot?.hash).toBe(closedView.snapshot?.hash);
      expect(dbPeriod.workDays).toHaveLength(3);
      expect(dbPeriod.workDays.map((w) => w.id).sort()).toEqual([d1.id, d2.id, d3.id].sort());

      // 4. Verificar auditoría
      const auditEvents = await prismaEmployer1.auditEvent.findMany({
        where: {
          entityType: 'PayrollPeriod',
          entityId: period.id,
          action: 'MONTHLY_ATTENDANCE_CLOSED',
        },
      });
      expect(auditEvents).toHaveLength(1);

      // 5. Verificar outbox email
      const outboxMessages = await prismaEmployer1.outboxMessage.findMany({
        where: {
          topic: 'notification.send_email',
        },
      });
      expect(outboxMessages.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('2. Invariante Temporal: Bloqueo de Cierre en Mes en Curso o Futuro', () => {
    it('rechaza cerrar el mes actual con ATTENDANCE_PERIOD_NOT_FINISHED', async () => {
      const fixture = await createActiveRelationshipFixture();
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      const period = await periodsServiceEmp1.getOrCreate(
        fixture.employerActor,
        fixture.relationship.id,
        { year: currentYear, month: currentMonth },
      );

      await expect(
        periodsServiceEmp1.closeAttendance(fixture.employerActor, period.id, {
          expectedVersion: period.version,
        }),
      ).rejects.toThrow(UnprocessableError);
    });
  });

  describe('3. Idempotencia concurrente en getOrCreate', () => {
    it('dos llamadas concurrentes a getOrCreate para el mismo mes crean exactamente 1 período', async () => {
      const fixture = await createActiveRelationshipFixture();

      const [res1, res2] = await Promise.all([
        periodsServiceEmp1.getOrCreate(fixture.employerActor, fixture.relationship.id, {
          year: 2025,
          month: 6,
        }),
        periodsServiceEmp2.getOrCreate(fixture.employerActor, fixture.relationship.id, {
          year: 2025,
          month: 6,
        }),
      ]);

      expect(res1.id).toBe(res2.id);
      expect(res1.year).toBe(2025);
      expect(res1.month).toBe(6);

      const dbPeriods = await prismaEmployer1.payrollPeriod.findMany({
        where: {
          employmentRelationshipId: fixture.relationship.id,
          year: 2025,
          month: 6,
        },
      });
      expect(dbPeriods).toHaveLength(1);
    });
  });

  describe('4. Concurrencia real CAS en closeAttendance (Close vs Close)', () => {
    it('dos clientes concurrentes intentando cerrar el mismo período: exactamente 1 gana, el otro recibe 409', async () => {
      const fixture = await createActiveRelationshipFixture();
      await createApprovedWorkDay(fixture.relationship.id, '2025-05-10', 480);

      const period = await periodsServiceEmp1.getOrCreate(
        fixture.employerActor,
        fixture.relationship.id,
        { year: 2025, month: 5 },
      );

      const results = await Promise.allSettled([
        periodsServiceEmp1.closeAttendance(fixture.employerActor, period.id, {
          expectedVersion: period.version,
        }),
        periodsServiceEmp2.closeAttendance(fixture.employerActor, period.id, {
          expectedVersion: period.version,
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      if (rejected[0]?.status === 'rejected') {
        expect(rejected[0].reason).toBeInstanceOf(ResourceVersionConflictError);
      }

      const snapshots = await prismaEmployer1.periodAttendanceSnapshot.findMany({
        where: { payrollPeriodId: period.id },
      });
      expect(snapshots).toHaveLength(1);
    });
  });

  describe('5. Concurrencia real Transaccional: closeAttendance vs requestCorrection', () => {
    it('ejecuta closeAttendance y requestCorrection concurrentemente sobre 2 PrismaClient: nunca ganan ambos', async () => {
      const fixture = await createActiveRelationshipFixture();
      const workDay = await createApprovedWorkDay(fixture.relationship.id, '2025-05-12', 480);

      const period = await periodsServiceEmp1.getOrCreate(
        fixture.employerActor,
        fixture.relationship.id,
        { year: 2025, month: 5 },
      );

      const results = await Promise.allSettled([
        periodsServiceEmp1.closeAttendance(fixture.employerActor, period.id, {
          expectedVersion: period.version,
        }),
        correctionsWorker.requestCorrection(fixture.workerActor, workDay.id, {
          reason: 'Ajuste de horario',
          proposedClockInAt: '2025-05-12T08:30:00.000Z',
          proposedClockOutAt: '2025-05-12T16:30:00.000Z',
          expectedVersion: workDay.version,
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactamente uno gana, el otro falla
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const updatedWorkDay = await prismaEmployer1.workDay.findUniqueOrThrow({
        where: { id: workDay.id },
      });
      const updatedPeriod = await prismaEmployer1.payrollPeriod.findUniqueOrThrow({
        where: { id: period.id },
      });

      if (updatedPeriod.status === PayrollPeriodStatus.READY_FOR_CALCULATION) {
        // Ganó closeAttendance: la jornada quedó vinculada al período cerrado y no está DISPUTED
        expect(updatedWorkDay.payrollPeriodId).toBe(period.id);
        expect(updatedWorkDay.status).toBe(WorkDayStatus.APPROVED);
      } else {
        // Ganó requestCorrection: la jornada quedó DISPUTED y el período sigue OPEN
        expect(updatedWorkDay.status).toBe(WorkDayStatus.DISPUTED);
        expect(updatedPeriod.status).toBe(PayrollPeriodStatus.OPEN);
      }
    });
  });

  describe('6. Invariante de Bloqueo de Modificaciones y ClockIn en Período Cerrado', () => {
    it('rechaza cualquier intento de solicitar corrección sobre una jornada de un período cerrado', async () => {
      const fixture = await createActiveRelationshipFixture();
      const workDay = await createApprovedWorkDay(fixture.relationship.id, '2025-05-15', 480);

      const period = await periodsServiceEmp1.getOrCreate(
        fixture.employerActor,
        fixture.relationship.id,
        { year: 2025, month: 5 },
      );

      await periodsServiceEmp1.closeAttendance(fixture.employerActor, period.id, {
        expectedVersion: period.version,
      });

      // Intento de la trabajadora de solicitar corrección en jornada cerrada
      await expect(
        correctionsWorker.requestCorrection(fixture.workerActor, workDay.id, {
          reason: 'Me olvidé de fichar el almuerzo',
          proposedClockInAt: '2025-05-15T08:00:00.000Z',
          proposedClockOutAt: '2025-05-15T16:00:00.000Z',
          expectedVersion: workDay.version,
        }),
      ).rejects.toThrow(UnprocessableError);
    });

    it('rechaza cualquier intento de aprobar jornada en un período cerrado', async () => {
      const fixture = await createActiveRelationshipFixture();
      const workDay = await createApprovedWorkDay(fixture.relationship.id, '2025-05-18', 480);

      const period = await periodsServiceEmp1.getOrCreate(
        fixture.employerActor,
        fixture.relationship.id,
        { year: 2025, month: 5 },
      );

      await periodsServiceEmp1.closeAttendance(fixture.employerActor, period.id, {
        expectedVersion: period.version,
      });

      await expect(
        timeTrackingEmp.approve(fixture.employerActor, workDay.id, {
          expectedVersion: workDay.version,
        }),
      ).rejects.toThrow(UnprocessableError);
    });

    it('rechaza cualquier intento de fichar salida en una jornada perteneciente a un período cerrado', async () => {
      const fixture = await createActiveRelationshipFixture();
      const workDay = await createApprovedWorkDay(fixture.relationship.id, '2025-05-20', 480);

      const period = await periodsServiceEmp1.getOrCreate(
        fixture.employerActor,
        fixture.relationship.id,
        { year: 2025, month: 5 },
      );

      await periodsServiceEmp1.closeAttendance(fixture.employerActor, period.id, {
        expectedVersion: period.version,
      });

      await expect(
        timeTrackingWorker.clockOut(fixture.workerActor, workDay.id, {
          clientIdempotencyKey: 'new-key-1',
        }),
      ).rejects.toThrow(UnprocessableError);
    });

    it('rechaza cualquier intento de la familia de resolver corrección en un período cerrado', async () => {
      const fixture = await createActiveRelationshipFixture();
      const workDay = await createApprovedWorkDay(fixture.relationship.id, '2025-05-22', 480);

      const period = await periodsServiceEmp1.getOrCreate(
        fixture.employerActor,
        fixture.relationship.id,
        { year: 2025, month: 5 },
      );

      await periodsServiceEmp1.closeAttendance(fixture.employerActor, period.id, {
        expectedVersion: period.version,
      });

      await expect(
        correctionsEmp.approveCorrection(
          fixture.employerActor,
          workDay.id,
          'non-existent-correction',
          workDay.version,
        ),
      ).rejects.toThrow(UnprocessableError);
    });

    it('rechaza un nuevo clockIn (jornada nueva) en un mes ya cerrado', async () => {
      const fixture = await createActiveRelationshipFixture();

      // clockIn usa new Date() → la fecha local del domicilio → año/mes actual.
      // Para simular que ese mes ya está cerrado, insertamos directamente un
      // PayrollPeriod con READY_FOR_CALCULATION para el mes en curso (la capa de
      // servicio no lo permitiría por la política temporal, pero el guard de
      // clockIn se basa puramente en que exista el registro).
      const now = new Date();
      const tz = 'America/Argentina/Buenos_Aires';
      const localDateStr = now.toLocaleDateString('en-CA', { timeZone: tz });
      const [yearStr, monthStr] = localDateStr.split('-');
      const currentYear = Number(yearStr);
      const currentMonth = Number(monthStr);

      const fromDate = new Date(
        `${currentYear}-${String(currentMonth).padStart(2, '0')}-01T00:00:00.000Z`,
      );
      const lastDay = new Date(currentYear, currentMonth, 0).getDate();
      const toDate = new Date(
        `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T00:00:00.000Z`,
      );

      await prismaEmployer1.payrollPeriod.create({
        data: {
          employmentRelationshipId: fixture.relationship.id,
          year: currentYear,
          month: currentMonth,
          periodType: 'MONTHLY',
          status: PayrollPeriodStatus.READY_FOR_CALCULATION,
          fromDate,
          toDate,
          attendanceApprovedAt: new Date(),
          attendanceApprovedByUserId: fixture.employerActor.userId,
          version: 1,
        },
      });

      // La trabajadora intenta fichar entrada → debe rechazarse con PERIOD_ATTENDANCE_CLOSED
      await expect(
        timeTrackingWorker.clockIn(fixture.workerActor, fixture.relationship.id, {
          method: 'BUTTON',
          clientIdempotencyKey: randomUUID(),
        }),
      ).rejects.toThrow(UnprocessableError);

      // Verificar que el error es específicamente PERIOD_ATTENDANCE_CLOSED
      try {
        await timeTrackingWorker.clockIn(fixture.workerActor, fixture.relationship.id, {
          method: 'BUTTON',
          clientIdempotencyKey: randomUUID(),
        });
        expect.unreachable('Debió lanzar UnprocessableError');
      } catch (error) {
        expect(error).toBeInstanceOf(UnprocessableError);
        expect((error as UnprocessableError).message).toContain('PERIOD_ATTENDANCE_CLOSED');
      }
    });
  });

  describe('7. Invariantes de Bloqueo Pre-Cierre (Readiness & Empty checks)', () => {
    it('bloquea el cierre si hay jornadas en estado OPEN', async () => {
      const fixture = await createActiveRelationshipFixture();
      await createApprovedWorkDay(fixture.relationship.id, '2025-05-01', 480);

      // Jornada OPEN
      await prismaEmployer1.workDay.create({
        data: {
          employmentRelationshipId: fixture.relationship.id,
          date: new Date('2025-05-02T00:00:00.000Z'),
          status: WorkDayStatus.OPEN,
        },
      });

      const period = await periodsServiceEmp1.getOrCreate(
        fixture.employerActor,
        fixture.relationship.id,
        { year: 2025, month: 5 },
      );

      await expect(
        periodsServiceEmp1.closeAttendance(fixture.employerActor, period.id, {
          expectedVersion: period.version,
        }),
      ).rejects.toThrow(UnprocessableError);
    });

    it('bloquea el cierre si hay jornadas en estado PENDING_APPROVAL', async () => {
      const fixture = await createActiveRelationshipFixture();
      await createApprovedWorkDay(fixture.relationship.id, '2025-05-01', 480);

      // Jornada PENDING_APPROVAL
      await prismaEmployer1.workDay.create({
        data: {
          employmentRelationshipId: fixture.relationship.id,
          date: new Date('2025-05-02T00:00:00.000Z'),
          status: WorkDayStatus.PENDING_APPROVAL,
          realMinutes: 480,
          computableMinutes: 480,
        },
      });

      const period = await periodsServiceEmp1.getOrCreate(
        fixture.employerActor,
        fixture.relationship.id,
        { year: 2025, month: 5 },
      );

      await expect(
        periodsServiceEmp1.closeAttendance(fixture.employerActor, period.id, {
          expectedVersion: period.version,
        }),
      ).rejects.toThrow(UnprocessableError);
    });

    it('bloquea el cierre si no hay jornadas aprobadas en el mes (período vacío)', async () => {
      const fixture = await createActiveRelationshipFixture();

      const period = await periodsServiceEmp1.getOrCreate(
        fixture.employerActor,
        fixture.relationship.id,
        { year: 2025, month: 5 },
      );

      await expect(
        periodsServiceEmp1.closeAttendance(fixture.employerActor, period.id, {
          expectedVersion: period.version,
        }),
      ).rejects.toThrow(UnprocessableError);
    });
  });

  describe('8. Aislamiento Multi-Tenant y Seguridad', () => {
    it('un usuario ajeno no puede obtener ni cerrar el período (404)', async () => {
      const fixture = await createActiveRelationshipFixture();
      await createApprovedWorkDay(fixture.relationship.id, '2025-05-01', 480);

      const period = await periodsServiceEmp1.getOrCreate(
        fixture.employerActor,
        fixture.relationship.id,
        { year: 2025, month: 5 },
      );

      await expect(
        periodsServiceStranger.getById(fixture.strangerActor, period.id),
      ).rejects.toThrow(NotFoundError);

      await expect(
        periodsServiceStranger.closeAttendance(fixture.strangerActor, period.id, {
          expectedVersion: period.version,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('la trabajadora no puede cerrar la asistencia del período (403)', async () => {
      const fixture = await createActiveRelationshipFixture();
      await createApprovedWorkDay(fixture.relationship.id, '2025-05-01', 480);

      const period = await periodsServiceEmp1.getOrCreate(
        fixture.employerActor,
        fixture.relationship.id,
        { year: 2025, month: 5 },
      );

      await expect(
        periodsServiceWorker.closeAttendance(fixture.workerActor, period.id, {
          expectedVersion: period.version,
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
