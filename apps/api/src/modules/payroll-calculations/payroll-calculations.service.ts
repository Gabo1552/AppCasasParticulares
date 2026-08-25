import { Injectable } from '@nestjs/common';
import { PayrollPeriodStatus, PlatformRole, Prisma } from '@casas/database';
import { calculatePayroll, type PayrollInput, type PayrollResult } from '@casas/payroll-engine';
import type { PayrollCalculationView } from '@casas/contracts';
import { AuditAction, AuditService } from '../../common/audit/audit.service';
import type { AuthenticatedActor } from '../../common/auth/auth.types';
import { ConflictError, NotFoundError, UnprocessableError } from '../../common/http/app.errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PayrollParametersService } from '../payroll-parameters/payroll-parameters.service';

/**
 * Preliquidación de un período mensual (paso 10 del recorrido vertical).
 *
 * El cálculo no vive acá: lo hace `@casas/payroll-engine`, que es puro y no sabe
 * nada de base de datos. Este servicio arma la entrada, invoca el motor y
 * persiste el resultado con su traza. Esa separación es lo que permite recalcular
 * un período histórico con su misma versión de parámetros y obtener exactamente
 * el resultado original (ADR 0001, decisión D3).
 *
 * **Lo que produce no es un recibo.** El recibo oficial se emite en ARCA
 * (principio 7); acá se calcula lo que la familia necesita para informarlo.
 */
@Injectable()
export class PayrollCalculationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly parameters: PayrollParametersService,
  ) {}

  /**
   * Calcula la preliquidación del período y la deja como versión vigente.
   *
   * Recalcular crea una versión nueva y deja intacta la anterior (RN-06): una
   * liquidación que alguien ya vio no se reescribe.
   */
  async calculate(actor: AuthenticatedActor, periodId: string): Promise<PayrollCalculationView> {
    const period = await this.loadPeriodForEmployer(actor, periodId);

    if (period.status !== PayrollPeriodStatus.READY_FOR_CALCULATION) {
      throw new ConflictError(
        'PERIOD_NOT_READY_FOR_CALCULATION',
        `El período está en ${period.status}. Sólo se puede calcular con la asistencia ya cerrada.`,
      );
    }

    const snapshot = period.attendanceSnapshot;
    if (snapshot === null) {
      // No debería ocurrir: el cierre de asistencia es lo que crea el snapshot.
      throw new UnprocessableError(
        'PERIOD_WITHOUT_ATTENDANCE_SNAPSHOT',
        'El período no tiene snapshot de asistencia, así que no hay minutos aprobados que liquidar.',
      );
    }

    const terms = await this.resolveTermsForPeriod(period.employmentRelationshipId, period.toDate);
    const parameters = await this.parameters.resolveForPeriod(period.fromDate, period.toDate);

    const result = calculatePayroll(
      buildPayrollInput({
        period,
        snapshot,
        terms,
        parameters: parameters.version,
        relationshipStartDate: period.relationship.startDate,
      }),
    );

    // Un error bloqueante no genera versión. Una `PayrollVersion` es el registro
    // de una liquidación que existió; una entrada inválida —por ejemplo una
    // remuneración por debajo del mínimo (LIQ-10, RN-07)— no lo es. El intento
    // queda auditado, que es lo que permite reconstruir después qué pasó.
    if (result.blockingErrors.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await this.audit.record(tx, {
          action: AuditAction.PAYROLL_CALCULATION_BLOCKED,
          entityType: 'PayrollPeriod',
          entityId: period.id,
          actor: {
            userId: actor.userId,
            role: PlatformRole.FAMILY_EMPLOYER,
            ipAddress: actor.ipAddress,
          },
          after: { blockingErrors: result.blockingErrors.map((error) => error.code) },
        });
      });

      throw new UnprocessableError(
        'PAYROLL_CALCULATION_BLOCKED',
        result.blockingErrors.map((error) => error.message).join(' '),
      );
    }

    return this.persist({ actor, period, parameterVersionId: parameters.id, result });
  }

  /** Devuelve la preliquidación vigente del período, con su detalle de conceptos. */
  async getCurrent(actor: AuthenticatedActor, periodId: string): Promise<PayrollCalculationView> {
    const period = await this.loadPeriodForParticipant(actor, periodId);

    const version = await this.prisma.payrollVersion.findFirst({
      where: { payrollPeriodId: period.id, isCurrent: true },
      include: { calculation: { include: { lineItems: { orderBy: { ordinal: 'asc' } } } } },
    });

    if (version === null || version.calculation === null) {
      throw new NotFoundError('Este período todavía no tiene una preliquidación calculada.');
    }

    return toView(period.id, version.versionNumber, version.calculation);
  }

  // ─── Persistencia ──────────────────────────────────────────────────────────

  private async persist(args: {
    actor: AuthenticatedActor;
    period: { id: string; currentVersionNumber: number; version: number };
    parameterVersionId: string;
    result: PayrollResult;
  }): Promise<PayrollCalculationView> {
    const { actor, period, parameterVersionId, result } = args;
    const versionNumber = period.currentVersionNumber + 1;

    return this.prisma.$transaction(async (tx) => {
      // La versión anterior deja de ser la vigente, pero se conserva entera.
      await tx.payrollVersion.updateMany({
        where: { payrollPeriodId: period.id, isCurrent: true },
        data: { isCurrent: false },
      });

      const payrollVersion = await tx.payrollVersion.create({
        data: {
          payrollPeriodId: period.id,
          versionNumber,
          isCurrent: true,
          createdByUserId: actor.userId,
        },
      });

      const calculation = await tx.payrollCalculation.create({
        data: {
          payrollVersionId: payrollVersion.id,
          payrollParameterVersionId: parameterVersionId,
          engineVersion: result.engineVersion,
          // Los importes llegan del motor como string decimal y entran a
          // NUMERIC(18,4) sin pasar nunca por `number` (RN-13, principio 5).
          grossEstimate: new Prisma.Decimal(result.grossEstimate),
          deductionsEstimate: new Prisma.Decimal(result.deductionsEstimate),
          netEstimate: new Prisma.Decimal(result.netEstimate),
          currency: result.currency,
          usedFixtureParameters: result.usedFixtureParameters,
          warnings: result.warnings as unknown as Prisma.InputJsonValue,
          blockingErrors: result.blockingErrors as unknown as Prisma.InputJsonValue,
          trace: result.trace as unknown as Prisma.InputJsonValue,
          estimatedObligations: result.estimatedObligations as unknown as Prisma.InputJsonValue,
          calculatedByUserId: actor.userId,
          lineItems: {
            create: result.lineItems.map((line, index) => ({
              ordinal: index + 1,
              code: line.code,
              label: line.label,
              sign: line.sign,
              calculationBase: new Prisma.Decimal(line.calculationBase),
              quantity: line.quantity === null ? null : new Prisma.Decimal(line.quantity),
              rate: line.rate,
              amount: new Prisma.Decimal(line.amount),
              formulaId: line.formulaId,
              formulaExplanation: line.formulaExplanation,
              parameterRef: line.parameterRef,
            })),
          },
        },
        include: { lineItems: { orderBy: { ordinal: 'asc' } } },
      });

      // Bloqueo optimista sobre el período: si otra request lo movió mientras
      // corría el motor, esta pierde en vez de dejar dos versiones vigentes.
      const moved = await tx.payrollPeriod.updateMany({
        where: {
          id: period.id,
          version: period.version,
          status: PayrollPeriodStatus.READY_FOR_CALCULATION,
        },
        data: {
          status: PayrollPeriodStatus.CALCULATED,
          currentVersionNumber: versionNumber,
          version: { increment: 1 },
        },
      });
      if (moved.count !== 1) {
        throw new ConflictError(
          'PERIOD_CONCURRENTLY_MODIFIED',
          'El período cambió mientras se calculaba. Volvé a intentarlo.',
        );
      }

      await this.audit.record(tx, {
        action: AuditAction.PAYROLL_CALCULATED,
        entityType: 'PayrollPeriod',
        entityId: period.id,
        actor: {
          userId: actor.userId,
          role: PlatformRole.FAMILY_EMPLOYER,
          ipAddress: actor.ipAddress,
        },
        // Se auditan los totales y la versión de parámetros usada, que es lo que
        // permite reconstruir el cálculo. La traza completa vive en la fila.
        after: {
          versionNumber,
          parameterVersionId,
          engineVersion: result.engineVersion,
          netEstimate: result.netEstimate,
          usedFixtureParameters: result.usedFixtureParameters,
        },
      });

      return toView(period.id, versionNumber, calculation);
    });
  }

  // ─── Carga y autorización ──────────────────────────────────────────────────

  private async loadPeriodForEmployer(actor: AuthenticatedActor, periodId: string) {
    const period = await this.prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      include: { relationship: true, attendanceSnapshot: true },
    });

    // 404 y no 403: quien no participa de la relación no tiene por qué enterarse
    // de que el período existe.
    if (period === null || period.relationship.employerId !== actor.employerId) {
      throw new NotFoundError('No encontramos ese período.');
    }
    return period;
  }

  private async loadPeriodForParticipant(actor: AuthenticatedActor, periodId: string) {
    const period = await this.prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      include: { relationship: true },
    });

    const participates =
      period !== null &&
      ((actor.employerId !== null && period.relationship.employerId === actor.employerId) ||
        (actor.workerId !== null && period.relationship.workerId === actor.workerId));

    if (!participates) {
      throw new NotFoundError('No encontramos ese período.');
    }
    return period;
  }

  /** Condiciones vigentes al cierre del período: los terms son versionados (REL-03). */
  private async resolveTermsForPeriod(relationshipId: string, toDate: Date) {
    const terms = await this.prisma.relationshipTerms.findFirst({
      where: {
        employmentRelationshipId: relationshipId,
        effectiveFrom: { lte: toDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: toDate } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (terms === null) {
      throw new UnprocessableError(
        'RELATIONSHIP_TERMS_NOT_FOUND',
        'La relación no tiene condiciones vigentes para este período.',
      );
    }
    if (terms.acceptedByWorkerAt === null) {
      throw new UnprocessableError(
        'RELATIONSHIP_TERMS_NOT_ACCEPTED',
        'Las condiciones vigentes todavía no fueron aceptadas por la trabajadora.',
      );
    }
    return terms;
  }
}

// ─── Armado de la entrada del motor ──────────────────────────────────────────

interface BuildInputArgs {
  period: { id: string; employmentRelationshipId: string; year: number; month: number };
  snapshot: { approvedMinutes: number };
  terms: {
    categoryCode: string;
    liveInMode: string;
    remunerationScheme: string;
    agreedRemuneration: Prisma.Decimal;
  };
  parameters: PayrollInput['parameters'];
  relationshipStartDate: Date;
}

export function buildPayrollInput(args: BuildInputArgs): PayrollInput {
  const { period, snapshot, terms, parameters, relationshipStartDate } = args;
  const month = String(period.month).padStart(2, '0');
  const calendarDays = new Date(Date.UTC(period.year, period.month, 0)).getUTCDate();

  return {
    employmentRelationshipId: period.employmentRelationshipId,
    payrollPeriodId: period.id,
    period: {
      year: period.year,
      month: period.month,
      periodType: 'MONTHLY',
      from: `${period.year}-${month}-01`,
      to: `${period.year}-${month}-${String(calendarDays).padStart(2, '0')}`,
      calendarDays,
    },
    categoryCode: terms.categoryCode,
    liveInMode: terms.liveInMode as PayrollInput['liveInMode'],
    remunerationScheme: terms.remunerationScheme as PayrollInput['remunerationScheme'],
    // `toString()` sobre el Decimal de Prisma: el importe nunca pasa por `number`.
    agreedRemuneration: terms.agreedRemuneration.toString(),
    parameters,
    normalMinutes: snapshot.approvedMinutes,
    // El fichaje todavía no clasifica horas extra ni feriados: la jornada
    // aprobada es un total de minutos. Hasta que los distinga, estas entradas van
    // vacías y el motor no inventa nada (docs/implementation-roadmap.md §4).
    overtime: [],
    holidayMinutes: 0,
    relationshipStartDate: relationshipStartDate.toISOString().slice(0, 10),
    unfavorableZoneCode: null,
    // Novedades y conceptos adicionales llegan con el módulo employment-events.
    events: [],
    annualBonus: { applies: false, bestSemesterRemuneration: '0', monthsWorkedInSemester: 0 },
    additionalConcepts: [],
  };
}

interface CalculationRow {
  id: string;
  engineVersion: string;
  grossEstimate: Prisma.Decimal;
  deductionsEstimate: Prisma.Decimal;
  netEstimate: Prisma.Decimal;
  currency: string;
  usedFixtureParameters: boolean;
  warnings: unknown;
  estimatedObligations: unknown;
  calculatedAt: Date;
  lineItems: {
    ordinal: number;
    code: string;
    label: string;
    sign: string;
    calculationBase: Prisma.Decimal;
    quantity: Prisma.Decimal | null;
    rate: string | null;
    amount: Prisma.Decimal;
    formulaId: string;
    formulaExplanation: string;
    parameterRef: string | null;
  }[];
}

function toView(
  periodId: string,
  versionNumber: number,
  calculation: CalculationRow,
): PayrollCalculationView {
  return {
    id: calculation.id,
    payrollPeriodId: periodId,
    versionNumber,
    engineVersion: calculation.engineVersion,
    grossEstimate: calculation.grossEstimate.toString(),
    deductionsEstimate: calculation.deductionsEstimate.toString(),
    netEstimate: calculation.netEstimate.toString(),
    currency: calculation.currency,
    usedFixtureParameters: calculation.usedFixtureParameters,
    calculatedAt: calculation.calculatedAt.toISOString(),
    lineItems: calculation.lineItems.map((line) => ({
      ordinal: line.ordinal,
      code: line.code,
      label: line.label,
      sign: line.sign as PayrollCalculationView['lineItems'][number]['sign'],
      calculationBase: line.calculationBase.toString(),
      quantity: line.quantity === null ? null : line.quantity.toString(),
      rate: line.rate,
      amount: line.amount.toString(),
      formulaId: line.formulaId,
      formulaExplanation: line.formulaExplanation,
      parameterRef: line.parameterRef,
    })),
    warnings: (calculation.warnings ?? []) as PayrollCalculationView['warnings'],
    estimatedObligations: (calculation.estimatedObligations ??
      []) as PayrollCalculationView['estimatedObligations'],
  };
}
