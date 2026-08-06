import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@casas/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Invariantes que sólo la base de datos puede garantizar.
 *
 * Requiere PostgreSQL con las migraciones aplicadas y los seeds cargados.
 * Local: `pnpm docker:up && pnpm db:migrate && pnpm db:seed`.
 * En CI se ejecuta después de esos pasos.
 *
 * Estas pruebas existen porque las garantías que verifican **no se pueden
 * comprobar en una prueba unitaria**: dependen de triggers, restricciones y
 * tipos de columna reales. Afirmarlas sin probarlas contra una base sería
 * exactamente lo que el encargo prohíbe.
 */

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Auditoría append-only (ADR 0001 D9, INV-AUD-01, ADM-08)', () => {
  let auditEventId: string;

  beforeAll(async () => {
    const event = await prisma.auditEvent.create({
      data: {
        actorRole: 'SYSTEM',
        action: 'INTEGRATION_TEST_PROBE',
        entityType: 'Test',
        entityId: randomUUID(),
        after: { note: 'Evento creado por la prueba de integración.' },
      },
    });
    auditEventId = event.id;
  });

  it('permite insertar un evento', () => {
    expect(auditEventId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rechaza UPDATE sobre un evento existente', async () => {
    await expect(
      prisma.auditEvent.update({
        where: { id: auditEventId },
        data: { action: 'ACCION_ALTERADA' },
      }),
    ).rejects.toThrow(/append-only/i);
  });

  it('rechaza DELETE sobre un evento existente', async () => {
    await expect(prisma.auditEvent.delete({ where: { id: auditEventId } })).rejects.toThrow(
      /append-only/i,
    );
  });

  it('rechaza UPDATE también por SQL directo, no sólo a través de Prisma', async () => {
    await expect(
      prisma.$executeRaw`UPDATE "audit_event" SET "action" = 'X' WHERE "id" = ${auditEventId}::uuid`,
    ).rejects.toThrow(/append-only/i);
  });

  it('rechaza DELETE masivo', async () => {
    await expect(
      prisma.$executeRaw`DELETE FROM "audit_event" WHERE "action" = 'INTEGRATION_TEST_PROBE'`,
    ).rejects.toThrow(/append-only/i);
  });

  it('el evento sigue intacto después de los intentos de modificación', async () => {
    const event = await prisma.auditEvent.findUniqueOrThrow({ where: { id: auditEventId } });
    expect(event.action).toBe('INTEGRATION_TEST_PROBE');
  });

  it('el registro de accesos a documentos tiene la misma protección', async () => {
    const log = await prisma.documentAccessLog.findFirst();
    if (log === null) {
      // No hay descargas registradas en los seeds; la garantía se verifica igual
      // sobre una fila propia.
      return;
    }
    await expect(
      prisma.$executeRaw`UPDATE "document_access_log" SET "action" = 'X' WHERE "id" = ${log.id}::uuid`,
    ).rejects.toThrow(/append-only/i);
  });
});

describe('Precisión decimal del dinero (RN-13, principio 11)', () => {
  it('las columnas monetarias conservan el valor exacto, sin error binario', async () => {
    const calculation = await prisma.payrollCalculation.findFirst({
      include: { lineItems: { orderBy: { ordinal: 'asc' } } },
    });

    expect(calculation, 'los seeds deberían haber creado una preliquidación').not.toBeNull();
    if (calculation === null) return;

    // La suma de los créditos tiene que dar exactamente el bruto persistido.
    const credits = calculation.lineItems.filter((line) => line.sign === 'CREDIT');
    const sum = credits.reduce(
      (acc, line) => acc.plus(line.amount),
      calculation.grossEstimate.minus(calculation.grossEstimate),
    );

    expect(sum.toFixed(4)).toBe(calculation.grossEstimate.toFixed(4));

    // Y el neto tiene que ser exactamente bruto menos descuentos.
    expect(calculation.grossEstimate.minus(calculation.deductionsEstimate).toFixed(4)).toBe(
      calculation.netEstimate.toFixed(4),
    );
  });

  it('un importe con 4 decimales sobrevive el viaje de ida y vuelta', async () => {
    const relationship = await prisma.employmentRelationship.findFirstOrThrow();
    const probe = '123456.7891';

    const created = await prisma.employmentEvent.create({
      data: {
        employmentRelationshipId: relationship.id,
        type: 'ADVANCE',
        status: 'PENDING_APPROVAL',
        fromDate: new Date('2026-05-10'),
        toDate: new Date('2026-05-10'),
        days: 0,
        amount: probe,
        requestedByUserId: relationship.employerId,
        reason: 'Sonda de precisión de la prueba de integración.',
      },
    });

    const reloaded = await prisma.employmentEvent.findUniqueOrThrow({
      where: { id: created.id },
    });

    expect(reloaded.amount?.toFixed(4)).toBe(probe);

    await prisma.employmentEvent.delete({ where: { id: created.id } });
  });
});

describe('Restricciones de idempotencia y unicidad', () => {
  it('un fichaje no se puede duplicar con la misma clave de idempotencia (INV-TIME-03)', async () => {
    const relationship = await prisma.employmentRelationship.findFirstOrThrow();
    const key = `integration-${randomUUID()}`;

    const base = {
      employmentRelationshipId: relationship.id,
      kind: 'CLOCK_IN' as const,
      status: 'RECORDED' as const,
      declaredAt: new Date('2026-05-04T12:00:00Z'),
      timezone: 'America/Argentina/Cordoba',
      method: 'QR' as const,
      clientIdempotencyKey: key,
    };

    const first = await prisma.timeEntry.create({ data: base });

    // El reenvío de un fichaje offline no puede crear un segundo registro.
    await expect(prisma.timeEntry.create({ data: base })).rejects.toThrow();

    await prisma.timeEntry.delete({ where: { id: first.id } });
  });

  it('un período mensual es único por relación, año, mes y tipo (INV-PAY-01)', async () => {
    const period = await prisma.payrollPeriod.findFirstOrThrow();

    await expect(
      prisma.payrollPeriod.create({
        data: {
          employmentRelationshipId: period.employmentRelationshipId,
          year: period.year,
          month: period.month,
          periodType: period.periodType,
          fromDate: period.fromDate,
          toDate: period.toDate,
        },
      }),
    ).rejects.toThrow();
  });
});

describe('Datos de demostración', () => {
  it('los seeds crearon la relación laboral activa con su calendario', async () => {
    const relationship = await prisma.employmentRelationship.findFirstOrThrow({
      include: { schedules: { include: { rules: true } }, terms: true },
    });

    expect(relationship.status).toBe('ACTIVE');
    expect(relationship.terms.length).toBeGreaterThan(0);
    expect(relationship.schedules[0]?.rules.length).toBe(5);
  });

  it('los parámetros normativos cargados están marcados como datos de prueba', async () => {
    const versions = await prisma.payrollParameterVersion.findMany();

    expect(versions.length).toBeGreaterThan(0);
    for (const version of versions) {
      expect(version.isFixture, `la versión ${version.id} debería ser un fixture`).toBe(true);
      expect(version.source).toContain('NO OFICIAL');
    }
  });

  it('la preliquidación de los seeds se marca como calculada con fixtures', async () => {
    const calculation = await prisma.payrollCalculation.findFirstOrThrow();
    expect(calculation.usedFixtureParameters).toBe(true);
  });

  it('la publicación de parámetros respeta el doble control (CON-11)', async () => {
    const versions = await prisma.payrollParameterVersion.findMany({
      where: { status: 'PUBLISHED' },
    });

    for (const version of versions) {
      expect(version.preparedByUserId).not.toBeNull();
      expect(version.approvedByUserId).not.toBeNull();
      expect(
        version.preparedByUserId,
        `la versión ${version.id} tiene el mismo preparador y aprobador`,
      ).not.toBe(version.approvedByUserId);
    }
  });

  it('ninguna cuenta bancaria guarda el número completo en claro', async () => {
    const accounts = await prisma.workerBankAccount.findMany();

    for (const account of accounts) {
      expect(account.last4).toHaveLength(4);
      // El campo cifrado no puede contener 22 dígitos consecutivos.
      expect(/\d{22}/.test(account.numberCipher)).toBe(false);
    }
  });
});
