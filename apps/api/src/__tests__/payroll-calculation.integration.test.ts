import { randomUUID } from 'node:crypto';
import { PrismaClient, Prisma, PayrollPeriodStatus } from '@casas/database';
import { FIXTURE_PARAMETERS_H1_2026 } from '@casas/payroll-engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditService } from '../common/audit/audit.service';
import { PayrollCalculationsService } from '../modules/payroll-calculations/payroll-calculations.service';
import { PayrollParametersService } from '../modules/payroll-parameters/payroll-parameters.service';
import type { PrismaService } from '../common/prisma/prisma.service';
import type { AuthenticatedActor } from '../common/auth/auth.types';

/**
 * Preliquidación contra PostgreSQL real.
 *
 * Lo que sólo se puede verificar acá y no con un doble: que los importes
 * sobrevivan el viaje a `NUMERIC(18,4)` sin perder precisión, que las líneas se
 * persistan con su orden, y que recalcular deje exactamente una versión vigente.
 *
 * Requiere el stack levantado: `pnpm docker:up && pnpm db:migrate`.
 */

const prisma = new PrismaClient();
const service = new PayrollCalculationsService(
  prisma as unknown as PrismaService,
  new AuditService(),
  new PayrollParametersService(prisma as unknown as PrismaService),
);

const ids = {
  employerUser: randomUUID(),
  workerUser: randomUUID(),
  employer: randomUUID(),
  worker: randomUUID(),
  household: randomUUID(),
  relationship: randomUUID(),
  period: randomUUID(),
};

let actor: AuthenticatedActor;

beforeAll(async () => {
  await prisma.$connect();

  await prisma.user.create({
    data: {
      id: ids.employerUser,
      email: `fam-${ids.employer}@ejemplo-ficticio.test`,
      displayName: 'Familia de prueba',
    },
  });
  await prisma.user.create({
    data: {
      id: ids.workerUser,
      email: `tra-${ids.worker}@ejemplo-ficticio.test`,
      displayName: 'Trabajadora de prueba',
    },
  });
  await prisma.employer.create({
    data: {
      id: ids.employer,
      userId: ids.employerUser,
      firstName: 'Ana',
      lastName: 'Prueba',
      legalName: 'Ana Prueba',
    },
  });
  await prisma.worker.create({
    data: {
      id: ids.worker,
      userId: ids.workerUser,
      firstName: 'Rosa',
      lastName: 'Prueba',
      legalName: 'Rosa Prueba',
    },
  });
  await prisma.household.create({
    data: {
      id: ids.household,
      employerId: ids.employer,
      label: 'Casa de prueba',
      street: 'Calle Falsa',
      streetNumber: '123',
      city: 'CABA',
      province: 'CABA',
      postalCode: '1000',
    },
  });
  await prisma.employmentRelationship.create({
    data: {
      id: ids.relationship,
      employerId: ids.employer,
      workerId: ids.worker,
      householdId: ids.household,
      status: 'ACTIVE',
      startDate: new Date('2024-03-01T00:00:00.000Z'),
    },
  });
  await prisma.relationshipTerms.create({
    data: {
      employmentRelationshipId: ids.relationship,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      categoryCode: 'FIXTURE_CAT_A',
      liveInMode: 'WITH_WITHDRAWAL',
      remunerationScheme: 'MONTHLY',
      // Cuatro decimales a propósito: es lo que verifica el ida y vuelta.
      agreedRemuneration: new Prisma.Decimal('400000.1234'),
      acceptedByWorkerAt: new Date('2026-01-05T00:00:00.000Z'),
    },
  });
  await prisma.payrollPeriod.create({
    data: {
      id: ids.period,
      employmentRelationshipId: ids.relationship,
      year: 2026,
      month: 5,
      status: PayrollPeriodStatus.READY_FOR_CALCULATION,
      fromDate: new Date('2026-05-01T00:00:00.000Z'),
      toDate: new Date('2026-05-31T00:00:00.000Z'),
    },
  });
  await prisma.periodAttendanceSnapshot.create({
    data: {
      payrollPeriodId: ids.period,
      approvedDays: 21,
      approvedMinutes: 9600,
      payload: { days: [] },
      hash: 'hash-de-prueba',
    },
  });

  actor = {
    userId: ids.employerUser,
    employerId: ids.employer,
    workerId: null,
    roles: ['FAMILY_EMPLOYER'],
    sessionId: randomUUID(),
  } as AuthenticatedActor;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Preliquidación contra PostgreSQL', () => {
  it('calcula, persiste y deja el período en CALCULATED', async () => {
    const view = await service.calculate(actor, ids.period);

    expect(view.versionNumber).toBe(1);
    expect(view.lineItems.length).toBeGreaterThan(0);
    expect(view.usedFixtureParameters).toBe(true);

    const period = await prisma.payrollPeriod.findUniqueOrThrow({ where: { id: ids.period } });
    expect(period.status).toBe(PayrollPeriodStatus.CALCULATED);
    expect(period.currentVersionNumber).toBe(1);
  });

  it('los importes conservan precisión decimal exacta en la ida y vuelta', async () => {
    const version = await prisma.payrollVersion.findFirstOrThrow({
      where: { payrollPeriodId: ids.period, isCurrent: true },
      include: { calculation: { include: { lineItems: { orderBy: { ordinal: 'asc' } } } } },
    });
    const calculation = version.calculation!;

    // La base del concepto de remuneración tiene que ser el importe pactado con
    // sus cuatro decimales, no un `number` redondeado.
    const base = calculation.lineItems[0]!.calculationBase;
    expect(base).toBeInstanceOf(Prisma.Decimal);
    expect(base.toString()).toBe('400000.1234');
  });

  it('las líneas quedan ordenadas y con su fórmula (LIQ-14)', async () => {
    const calculation = await prisma.payrollCalculation.findFirstOrThrow({
      where: { payrollVersion: { payrollPeriodId: ids.period, isCurrent: true } },
      include: { lineItems: { orderBy: { ordinal: 'asc' } } },
    });

    expect(calculation.lineItems.map((l) => l.ordinal)).toEqual(
      calculation.lineItems.map((_, index) => index + 1),
    );
    for (const line of calculation.lineItems) {
      expect(line.formulaId.length).toBeGreaterThan(0);
      expect(line.formulaExplanation.length).toBeGreaterThan(0);
    }
  });

  it('el cálculo queda auditado con la versión de parámetros usada', async () => {
    const events = await prisma.auditEvent.findMany({
      where: { entityId: ids.period, action: 'PAYROLL_CALCULATED' },
    });

    expect(events).toHaveLength(1);
    expect((events[0]!.after as Record<string, unknown>).parameterVersionId).toBe(
      FIXTURE_PARAMETERS_H1_2026.id,
    );
  });

  it('no se puede volver a calcular un período que ya no está listo', async () => {
    // El período quedó en CALCULATED: recalcular exige pasar por rectificación,
    // que es otro flujo (LIQ-13, RN-06).
    await expect(service.calculate(actor, ids.period)).rejects.toThrow(
      /Sólo se puede calcular con la asistencia ya cerrada/,
    );
  });

  it('existe exactamente una versión vigente', async () => {
    const current = await prisma.payrollVersion.count({
      where: { payrollPeriodId: ids.period, isCurrent: true },
    });

    expect(current).toBe(1);
  });

  it('la trabajadora ve el detalle de conceptos de su período', async () => {
    const workerActor = {
      userId: ids.workerUser,
      employerId: null,
      workerId: ids.worker,
      roles: ['WORKER'],
      sessionId: randomUUID(),
    } as AuthenticatedActor;

    const view = await service.getCurrent(workerActor, ids.period);

    expect(view.payrollPeriodId).toBe(ids.period);
    expect(view.lineItems.length).toBeGreaterThan(0);
  });
});
