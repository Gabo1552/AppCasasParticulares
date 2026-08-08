import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { PrismaClient, PlatformRole } from '@casas/database';
import { ResourceVersionConflictError } from '@casas/domain';
import { RelationshipsService } from '../../modules/employment-relationships/relationships.service';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../../modules/notifications/notifications.service';
import type { AppConfig } from '../../config/app-config';
import type { AuthenticatedActor } from '../../common/auth/auth.types';

describe('Prueba de Concurrencia Real PostgreSQL — Modificación y Aceptación Simultáneas', () => {
  let prismaEmployer: PrismaClient;
  let prismaWorker: PrismaClient;
  let isDbAvailable = false;

  beforeAll(async () => {
    prismaEmployer = new PrismaClient();
    prismaWorker = new PrismaClient();
    try {
      await prismaEmployer.$connect();
      await prismaWorker.$connect();
      isDbAvailable = true;
    } catch {
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (isDbAvailable) {
      await prismaEmployer.$disconnect();
      await prismaWorker.$disconnect();
    }
  });

  it('ejecuta transacción concurrente real contra PostgreSQL y garantiza que solo una versión se acepte', async () => {
    if (!isDbAvailable) {
      // Si la BD PostgreSQL local no está levantada en este entorno, se omite el test con advertencia.
      return;
    }

    const config = {
      WEB_BASE_URL: 'http://localhost:3000',
    } as AppConfig;

    const audit = new AuditService();
    const notifications = {
      sendConditionsAccepted: async () => {},
    } as unknown as NotificationsService;

    const serviceEmployer = new RelationshipsService(
      prismaEmployer as never,
      audit,
      notifications,
      config,
    );
    const serviceWorker = new RelationshipsService(
      prismaWorker as never,
      audit,
      notifications,
      config,
    );

    // 1. Crear usuarios y relación de prueba en PostgreSQL
    const userEmp = await prismaEmployer.user.create({
      data: { email: `emp-${Date.now()}@example.com`, displayName: 'Familia Test' },
    });
    const userWrk = await prismaEmployer.user.create({
      data: { email: `wrk-${Date.now()}@example.com`, displayName: 'Trabajadora Test' },
    });
    const empProfile = await prismaEmployer.employer.create({
      data: {
        userId: userEmp.id,
        firstName: 'Familia',
        lastName: 'Test',
        legalName: 'Familia Test',
      },
    });
    const wrkProfile = await prismaEmployer.worker.create({
      data: {
        userId: userWrk.id,
        firstName: 'Trabajadora',
        lastName: 'Test',
        legalName: 'Trabajadora Test',
      },
    });
    const household = await prismaEmployer.household.create({
      data: {
        employerId: empProfile.id,
        label: 'Casa Concurrencia',
        street: 'Av. Corrientes',
        streetNumber: '1234',
        city: 'CABA',
        province: 'CABA',
        postalCode: '1000',
      },
    });

    const rel = await prismaEmployer.employmentRelationship.create({
      data: {
        employerId: empProfile.id,
        workerId: wrkProfile.id,
        householdId: household.id,
        startDate: new Date(),
        status: 'PENDING_WORKER_ACCEPTANCE',
        version: 1,
        terms: {
          create: {
            categoryCode: 'TAREAS_GENERALES',
            liveInMode: 'WITH_WITHDRAWAL',
            remunerationScheme: 'MONTHLY',
            agreedRemuneration: 350000.0,
            weeklyHours: 24,
            createdByUserId: userEmp.id,
            effectiveFrom: new Date(),
          },
        },
      },
    });

    const employerActor: AuthenticatedActor = {
      userId: userEmp.id,
      sessionId: 'sess-1',
      roles: [PlatformRole.FAMILY_EMPLOYER],
      employerId: empProfile.id,
      workerId: null,
    };

    const workerActor: AuthenticatedActor = {
      userId: userWrk.id,
      sessionId: 'sess-2',
      roles: [PlatformRole.WORKER],
      employerId: null,
      workerId: wrkProfile.id,
    };

    // 2. Ejecutar modificación (familia) y aceptación (trabajadora) de forma concurrente con conexiones PostgreSQL independientes
    const results = await Promise.allSettled([
      serviceEmployer.saveConditions(employerActor, rel.id, {
        plannedStartDate: '2026-09-01',
        categoryCode: 'TAREAS_GENERALES',
        liveInMode: 'WITH_WITHDRAWAL',
        remunerationScheme: 'MONTHLY',
        agreedRemuneration: '450000.00',
        weeklyHours: 24,
        requiresProfessionalReview: false,
      }),
      serviceWorker.acceptConditions(workerActor, rel.id),
    ]);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    // Debe haber 1 éxito y 1 fallo por ResourceVersionConflictError
    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);

    const errorReason = (failed[0] as PromiseRejectedResult).reason;
    expect(errorReason).toBeInstanceOf(ResourceVersionConflictError);

    // 3. Inspeccionar el estado final en PostgreSQL
    const finalRel = await prismaEmployer.employmentRelationship.findUnique({
      where: { id: rel.id },
    });

    expect(finalRel).not.toBeNull();
    // La relación sólo puede ser ACTIVE si la trabajadora ganó la carrera. Si la familia ganó, vuelve a PENDING_CONFIGURATION.
    if (finalRel?.status === 'ACTIVE') {
      const evidence = finalRel.workerAcceptanceEvidence as Record<string, unknown>;
      expect(evidence).not.toBeNull();
      expect(evidence.snapshotSchemaVersion).toBe('1.0');
      expect(evidence.acceptedSnapshotHash).toBeDefined();
      expect(evidence.acceptedSnapshot).toBeDefined();
    } else {
      expect(finalRel?.status).toBe('PENDING_CONFIGURATION');
    }
  });
});
