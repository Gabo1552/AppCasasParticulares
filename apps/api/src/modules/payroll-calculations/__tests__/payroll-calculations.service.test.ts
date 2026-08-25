import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PayrollPeriodStatus, PlatformRole, Prisma } from '@casas/database';
import { FIXTURE_PARAMETERS_H1_2026 } from '@casas/payroll-engine';
import type { AuthenticatedActor } from '../../../common/auth/auth.types';
import type { AuditService } from '../../../common/audit/audit.service';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { PayrollParametersService } from '../../payroll-parameters/payroll-parameters.service';
import { ConflictError, NotFoundError, UnprocessableError } from '../../../common/http/app.errors';
import { PayrollCalculationsService, buildPayrollInput } from '../payroll-calculations.service';

/**
 * Orquestación de la preliquidación.
 *
 * El cálculo lo verifica el motor con sus 13 escenarios; acá se prueba lo que el
 * motor no puede saber: quién puede pedirlo, en qué estado del período, qué pasa
 * con un error bloqueante y que el resultado se persista sin perder precisión.
 */

const employerActor: AuthenticatedActor = {
  userId: 'user-employer',
  employerId: 'emp-1',
  workerId: null,
  roles: [PlatformRole.FAMILY_EMPLOYER],
  sessionId: 'sess-1',
} as AuthenticatedActor;

const workerActor: AuthenticatedActor = {
  userId: 'user-worker',
  employerId: null,
  workerId: 'wrk-1',
  roles: [PlatformRole.WORKER],
  sessionId: 'sess-2',
} as AuthenticatedActor;

const strangerActor: AuthenticatedActor = {
  userId: 'user-stranger',
  employerId: 'emp-otra',
  workerId: null,
  roles: [PlatformRole.FAMILY_EMPLOYER],
  sessionId: 'sess-3',
} as AuthenticatedActor;

function makePeriod(overrides: Record<string, unknown> = {}) {
  return {
    id: 'period-1',
    employmentRelationshipId: 'rel-1',
    year: 2026,
    month: 5,
    status: PayrollPeriodStatus.READY_FOR_CALCULATION,
    fromDate: new Date('2026-05-01T00:00:00.000Z'),
    toDate: new Date('2026-05-31T00:00:00.000Z'),
    currentVersionNumber: 0,
    version: 3,
    relationship: {
      id: 'rel-1',
      employerId: 'emp-1',
      workerId: 'wrk-1',
      startDate: new Date('2024-03-01T00:00:00.000Z'),
    },
    attendanceSnapshot: { approvedMinutes: 9600, approvedDays: 21 },
    ...overrides,
  };
}

const terms = {
  categoryCode: 'FIXTURE_CAT_A',
  liveInMode: 'WITH_WITHDRAWAL',
  remunerationScheme: 'MONTHLY',
  agreedRemuneration: new Prisma.Decimal('400000.0000'),
  acceptedByWorkerAt: new Date('2026-04-01T00:00:00.000Z'),
};

type Mock = ReturnType<typeof vi.fn>;

/** Doble acotado a lo que el servicio realmente usa. */
interface FakePrisma {
  payrollPeriod: { findUnique: Mock };
  relationshipTerms: { findFirst: Mock };
  payrollVersion: { findFirst: Mock };
  $transaction: Mock;
  /** El cliente transaccional, expuesto para poder afirmar sobre sus llamadas. */
  __tx: {
    payrollVersion: { updateMany: Mock; create: Mock };
    payrollCalculation: { create: Mock };
    payrollPeriod: { updateMany: Mock };
    auditEvent: { create: Mock };
  };
}

describe('PayrollCalculationsService', () => {
  let prisma: FakePrisma;
  let audit: { record: ReturnType<typeof vi.fn> };
  let parameters: { resolveForPeriod: ReturnType<typeof vi.fn> };
  let service: PayrollCalculationsService;
  let created: { calculation?: Record<string, unknown>; version?: Record<string, unknown> };

  beforeEach(() => {
    created = {};
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    parameters = {
      resolveForPeriod: vi
        .fn()
        .mockResolvedValue({ id: 'param-1', isFixture: true, version: FIXTURE_PARAMETERS_H1_2026 }),
    };

    const tx = {
      payrollVersion: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
          created.version = args.data;
          return Promise.resolve({ id: 'version-1', ...args.data });
        }),
      },
      payrollCalculation: {
        create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
          created.calculation = args.data;
          const lineItems = (
            args.data.lineItems as { create: Record<string, unknown>[] }
          ).create.map((line) => ({ ...line }));
          return Promise.resolve({
            id: 'calc-1',
            calculatedAt: new Date('2026-06-01T12:00:00.000Z'),
            engineVersion: args.data.engineVersion,
            grossEstimate: args.data.grossEstimate,
            deductionsEstimate: args.data.deductionsEstimate,
            netEstimate: args.data.netEstimate,
            currency: args.data.currency,
            usedFixtureParameters: args.data.usedFixtureParameters,
            warnings: args.data.warnings,
            estimatedObligations: args.data.estimatedObligations,
            lineItems,
          });
        }),
      },
      payrollPeriod: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      auditEvent: { create: vi.fn() },
    };

    prisma = {
      payrollPeriod: { findUnique: vi.fn().mockResolvedValue(makePeriod()) },
      relationshipTerms: { findFirst: vi.fn().mockResolvedValue(terms) },
      payrollVersion: { findFirst: vi.fn() },
      $transaction: vi.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(tx)),
      __tx: tx,
    };

    service = new PayrollCalculationsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      parameters as unknown as PayrollParametersService,
    );
  });

  describe('autorización', () => {
    it('una familia ajena recibe 404, no 403', async () => {
      // Que exista un período de otra familia no es información que corresponda
      // revelar: 403 confirmaría el identificador.
      await expect(service.calculate(strangerActor, 'period-1')).rejects.toThrow(NotFoundError);
    });

    it('un período inexistente también da 404', async () => {
      prisma.payrollPeriod.findUnique.mockResolvedValue(null);

      await expect(service.calculate(employerActor, 'period-1')).rejects.toThrow(NotFoundError);
    });

    it('la trabajadora puede consultar la preliquidación de su relación', async () => {
      prisma.payrollVersion.findFirst.mockResolvedValue({
        versionNumber: 1,
        calculation: {
          id: 'calc-1',
          engineVersion: '0.1.0',
          grossEstimate: new Prisma.Decimal('410000'),
          deductionsEstimate: new Prisma.Decimal('20500'),
          netEstimate: new Prisma.Decimal('389500'),
          currency: 'ARS',
          usedFixtureParameters: true,
          warnings: [],
          estimatedObligations: [],
          calculatedAt: new Date('2026-06-01T12:00:00.000Z'),
          lineItems: [],
        },
      });

      const view = await service.getCurrent(workerActor, 'period-1');

      expect(view.netEstimate).toBe('389500');
    });

    it('una persona ajena no puede consultarla', async () => {
      await expect(service.getCurrent(strangerActor, 'period-1')).rejects.toThrow(NotFoundError);
    });
  });

  describe('estado del período', () => {
    it('no calcula si la asistencia no fue cerrada', async () => {
      prisma.payrollPeriod.findUnique.mockResolvedValue(
        makePeriod({ status: PayrollPeriodStatus.OPEN }),
      );

      await expect(service.calculate(employerActor, 'period-1')).rejects.toThrow(ConflictError);
    });

    it('no calcula sin snapshot de asistencia', async () => {
      prisma.payrollPeriod.findUnique.mockResolvedValue(makePeriod({ attendanceSnapshot: null }));

      await expect(service.calculate(employerActor, 'period-1')).rejects.toThrow(
        UnprocessableError,
      );
    });

    it('no calcula con condiciones que la trabajadora todavía no aceptó', async () => {
      prisma.relationshipTerms.findFirst.mockResolvedValue({ ...terms, acceptedByWorkerAt: null });

      await expect(service.calculate(employerActor, 'period-1')).rejects.toThrow(
        /todavía no fueron aceptadas/,
      );
    });

    it('un período movido por otra request en paralelo da conflicto', async () => {
      prisma.__tx.payrollPeriod.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.calculate(employerActor, 'period-1')).rejects.toThrow(ConflictError);
    });
  });

  describe('cálculo y persistencia', () => {
    it('deja el período en CALCULATED con la versión 1 como vigente', async () => {
      await service.calculate(employerActor, 'period-1');

      const tx = prisma.__tx;
      const call = tx.payrollPeriod.updateMany.mock.calls[0]![0] as {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      };

      expect(call.data.status).toBe(PayrollPeriodStatus.CALCULATED);
      expect(call.data.currentVersionNumber).toBe(1);
      // Bloqueo optimista: la actualización exige la versión que se leyó.
      expect(call.where.version).toBe(3);
    });

    it('los importes se persisten como Decimal, nunca como number', async () => {
      await service.calculate(employerActor, 'period-1');

      for (const field of ['grossEstimate', 'deductionsEstimate', 'netEstimate'] as const) {
        expect(created.calculation![field]).toBeInstanceOf(Prisma.Decimal);
      }
    });

    it('propaga que se usaron parámetros de prueba', async () => {
      const view = await service.calculate(employerActor, 'period-1');

      // Si esto se perdiera, la UI mostraría un importe ficticio como si fuera
      // oficial.
      expect(view.usedFixtureParameters).toBe(true);
      expect(created.calculation!.usedFixtureParameters).toBe(true);
    });

    it('guarda la traza y la versión de parámetros usada', async () => {
      await service.calculate(employerActor, 'period-1');

      expect(created.calculation!.payrollParameterVersionId).toBe('param-1');
      expect(Array.isArray(created.calculation!.trace)).toBe(true);
      expect((created.calculation!.trace as unknown[]).length).toBeGreaterThan(0);
    });

    it('cada línea lleva fórmula y explicación (LIQ-14)', async () => {
      const view = await service.calculate(employerActor, 'period-1');

      expect(view.lineItems.length).toBeGreaterThan(0);
      for (const line of view.lineItems) {
        expect(line.formulaId).not.toBe('');
        expect(line.formulaExplanation).not.toBe('');
      }
    });

    it('audita el cálculo sin volcar la liquidación entera', async () => {
      await service.calculate(employerActor, 'period-1');

      expect(audit.record).toHaveBeenCalledTimes(1);
      const input = audit.record.mock.calls[0]![1] as {
        action: string;
        after: Record<string, unknown>;
      };
      expect(input.action).toBe('PAYROLL_CALCULATED');
      expect(input.after.parameterVersionId).toBe('param-1');
    });

    it('recalcular deja de ser vigente la versión anterior', async () => {
      await service.calculate(employerActor, 'period-1');

      const tx = prisma.__tx;
      const call = tx.payrollVersion.updateMany.mock.calls[0]![0] as {
        data: Record<string, unknown>;
      };
      // La anterior se conserva entera; sólo deja de ser la vigente (RN-06).
      expect(call.data.isCurrent).toBe(false);
    });
  });

  describe('error bloqueante', () => {
    it('una remuneración bajo el mínimo no genera versión y audita el intento', async () => {
      prisma.relationshipTerms.findFirst.mockResolvedValue({
        ...terms,
        agreedRemuneration: new Prisma.Decimal('1.0000'),
      });

      await expect(service.calculate(employerActor, 'period-1')).rejects.toThrow(
        UnprocessableError,
      );

      const tx = prisma.__tx;
      expect(tx.payrollVersion.create).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledTimes(1);
      const input = audit.record.mock.calls[0]![1] as { action: string };
      expect(input.action).toBe('PAYROLL_CALCULATION_BLOCKED');
    });
  });
});

describe('buildPayrollInput', () => {
  const base = {
    period: { id: 'period-1', employmentRelationshipId: 'rel-1', year: 2026, month: 5 },
    snapshot: { approvedMinutes: 9600 },
    terms: {
      categoryCode: 'FIXTURE_CAT_A',
      liveInMode: 'WITH_WITHDRAWAL',
      remunerationScheme: 'MONTHLY',
      agreedRemuneration: new Prisma.Decimal('400000.0000'),
    },
    parameters: FIXTURE_PARAMETERS_H1_2026,
    relationshipStartDate: new Date('2024-03-01T00:00:00.000Z'),
  };

  it('toma los minutos del snapshot, no de las jornadas', () => {
    // El snapshot es inmutable: es lo que hace reproducible el cálculo.
    expect(buildPayrollInput(base).normalMinutes).toBe(9600);
  });

  it('arma el rango del mes con la cantidad real de días', () => {
    const input = buildPayrollInput(base);

    expect(input.period.from).toBe('2026-05-01');
    expect(input.period.to).toBe('2026-05-31');
    expect(input.period.calendarDays).toBe(31);
  });

  it('resuelve febrero sin inventar días', () => {
    const input = buildPayrollInput({ ...base, period: { ...base.period, month: 2 } });

    expect(input.period.to).toBe('2026-02-28');
    expect(input.period.calendarDays).toBe(28);
  });

  it('pasa la remuneración como string decimal', () => {
    const input = buildPayrollInput(base);

    expect(input.agreedRemuneration).toBe('400000');
    expect(typeof input.agreedRemuneration).toBe('string');
  });

  it('no inventa horas extra ni feriados mientras el fichaje no los clasifique', () => {
    const input = buildPayrollInput(base);

    expect(input.overtime).toEqual([]);
    expect(input.holidayMinutes).toBe(0);
  });
});
