import type { LocalDate, RoundingMode } from '@casas/domain';

/**
 * Parámetros normativos versionados.
 *
 * Esta es la pieza que hace que el motor sea reutilizable ante cambios de ley sin
 * tocar código (RN-14) y que una liquidación histórica se pueda recalcular con
 * exactamente la norma que regía entonces (RN-02, LIQ-02).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ADVERTENCIA
 *
 * Este archivo define la **forma** de los parámetros. No contiene valores.
 * Los valores viven en la base de datos, cargados por un contador matriculado
 * mediante el flujo de doble control (CON-11, ADM-02).
 *
 * Los fixtures de `src/fixtures/` son **datos de prueba inventados** para poder
 * ejercitar el motor. No son valores oficiales y el tipo los obliga a declararlo:
 * `isFixture: true` y `source` con el prefijo reglamentario.
 * ────────────────────────────────────────────────────────────────────────────
 */

export const ParameterVersionStatus = {
  DRAFT: 'DRAFT',
  UNDER_REVIEW: 'UNDER_REVIEW',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ParameterVersionStatus =
  (typeof ParameterVersionStatus)[keyof typeof ParameterVersionStatus];

/** Prefijo obligatorio en `source` para todo parámetro que no sea oficial. */
export const FIXTURE_SOURCE_PREFIX = 'FIXTURE — DATO DE PRUEBA, NO OFICIAL';

export const LiveInMode = {
  /** Con retiro: la trabajadora no reside en el domicilio. */
  WITH_WITHDRAWAL: 'WITH_WITHDRAWAL',
  /** Sin retiro: la trabajadora reside en el domicilio. */
  WITHOUT_WITHDRAWAL: 'WITHOUT_WITHDRAWAL',
} as const;
export type LiveInMode = (typeof LiveInMode)[keyof typeof LiveInMode];

export const RemunerationScheme = {
  MONTHLY: 'MONTHLY',
  HOURLY: 'HOURLY',
} as const;
export type RemunerationScheme = (typeof RemunerationScheme)[keyof typeof RemunerationScheme];

/** Política de redondeo. El motor nunca redondea sin consultarla (RN-13). */
export interface RoundingPolicy {
  /** Decimales a los que se redondea cada concepto liquidado. */
  readonly conceptDecimals: number;
  /** Decimales del total neto. */
  readonly totalDecimals: number;
  readonly mode: RoundingMode;
}

/**
 * Escala mínima de una categoría. Se identifica por categoría + modalidad porque el
 * régimen distingue ambas dimensiones.
 */
export interface CategoryScale {
  readonly categoryCode: string;
  readonly categoryLabel: string;
  readonly liveInMode: LiveInMode;
  /** Mínimo mensual, decimal exacto como string. */
  readonly monthlyMinimum: string;
  /** Mínimo horario, decimal exacto como string. */
  readonly hourlyMinimum: string;
}

/**
 * Tramo de antigüedad. Se declara como lista de tramos con porcentaje, sin suponer
 * cuántos tramos hay ni cuánto vale cada uno: eso lo define el parámetro.
 */
export interface SeniorityTier {
  readonly fromCompletedYears: number;
  readonly toCompletedYears: number | null;
  /** Porcentaje enunciado como número: "1" significa 1 %. */
  readonly percentage: string;
}

export interface SeniorityRule {
  readonly enabled: boolean;
  readonly tiers: readonly SeniorityTier[];
  /** Sobre qué se calcula el adicional. */
  readonly basis: 'BASE_REMUNERATION' | 'BASE_PLUS_OVERTIME';
}

/**
 * Tipos de hora extra. El catálogo es abierto: cada entrada define su multiplicador.
 * El motor no supone qué tipos existen ni cuánto valen.
 */
export interface OvertimeKind {
  readonly code: string;
  readonly label: string;
  /** Multiplicador sobre el valor hora. "1.5" = hora y media. */
  readonly multiplier: string;
}

export interface OvertimeRule {
  readonly enabled: boolean;
  readonly kinds: readonly OvertimeKind[];
  /** Divisor mensual para derivar el valor hora de una remuneración mensual. */
  readonly monthlyHoursDivisor: string;
}

export interface HolidayRule {
  readonly enabled: boolean;
  /** Multiplicador de la hora trabajada en feriado. */
  readonly workedMultiplier: string;
  /** Si un feriado no trabajado se remunera en el esquema por hora. */
  readonly paidWhenNotWorkedHourly: boolean;
}

export interface UnfavorableZoneRule {
  readonly enabled: boolean;
  readonly zones: readonly { readonly code: string; readonly percentage: string }[];
}

export interface VacationRule {
  readonly enabled: boolean;
  /** Divisor para obtener el valor del día de vacaciones desde el mensual. */
  readonly dailyDivisor: string;
}

export interface AnnualBonusRule {
  readonly enabled: boolean;
  /** Divisor de la mejor remuneración del semestre. */
  readonly divisor: string;
}

export interface AbsenceRule {
  readonly enabled: boolean;
  /** Divisor para el descuento diario en el esquema mensual. */
  readonly dailyDivisor: string;
}

/** Aporte (a cargo de la trabajadora) o contribución (a cargo de la familia). */
export interface ContributionItem {
  readonly code: string;
  readonly label: string;
  readonly percentage: string;
  readonly borneBy: 'WORKER' | 'EMPLOYER';
  /** Base de cálculo. */
  readonly basis: 'GROSS_REMUNERATION' | 'FIXED_AMOUNT';
  /** Importe fijo cuando `basis === 'FIXED_AMOUNT'`. */
  readonly fixedAmount?: string;
}

export interface WorkRiskRule {
  readonly enabled: boolean;
  readonly code: string;
  readonly label: string;
  readonly percentage: string;
  readonly fixedAmount: string | null;
}

/**
 * Versión completa e inmutable de los parámetros normativos.
 *
 * Una `PayrollCalculation` referencia el `id` de la versión que usó. Recalcularla más
 * adelante con esa misma versión tiene que dar exactamente el mismo resultado
 * (INV-PAY-02, prueba de regresión normativa).
 */
export interface PayrollParameterVersion {
  readonly id: string;
  readonly status: ParameterVersionStatus;
  /**
   * Fuente oficial del parámetro (RN-01). Obligatorio.
   * Los fixtures llevan `FIXTURE_SOURCE_PREFIX`.
   */
  readonly source: string;
  /** `true` cuando los valores son inventados para pruebas. */
  readonly isFixture: boolean;
  readonly effectiveFrom: LocalDate;
  readonly effectiveTo: LocalDate | null;
  readonly currency: 'ARS';

  readonly rounding: RoundingPolicy;
  readonly categories: readonly CategoryScale[];
  readonly seniority: SeniorityRule;
  readonly overtime: OvertimeRule;
  readonly holiday: HolidayRule;
  readonly unfavorableZone: UnfavorableZoneRule | null;
  readonly vacation: VacationRule;
  readonly annualBonus: AnnualBonusRule;
  readonly absence: AbsenceRule;
  readonly contributions: readonly ContributionItem[];
  readonly workRisk: WorkRiskRule;

  /** Doble control: quien prepara no puede ser quien aprueba (CON-11, INV-PARAM-02). */
  readonly preparedByUserId: string | null;
  readonly approvedByUserId: string | null;
  readonly publishedAt: string | null;
}

/** Busca la escala de una categoría + modalidad. */
export function findCategoryScale(
  version: PayrollParameterVersion,
  categoryCode: string,
  liveInMode: LiveInMode,
): CategoryScale | undefined {
  return version.categories.find(
    (scale) => scale.categoryCode === categoryCode && scale.liveInMode === liveInMode,
  );
}

/**
 * Verifica las invariantes estructurales de una versión de parámetros.
 * Devuelve la lista de problemas; vacía significa que la versión es coherente.
 *
 * Se ejecuta antes de publicar (ADM-02) y en las pruebas de los fixtures.
 */
export function validateParameterVersion(version: PayrollParameterVersion): string[] {
  const problems: string[] = [];

  if (version.source.trim().length === 0) {
    problems.push('INV-PARAM-03: `source` es obligatorio en toda versión de parámetros (RN-01).');
  }

  if (version.isFixture && !version.source.startsWith(FIXTURE_SOURCE_PREFIX)) {
    problems.push(
      `INV-PARAM-03: una versión de fixture debe declarar su origen con el prefijo "${FIXTURE_SOURCE_PREFIX}".`,
    );
  }

  if (!version.isFixture && version.source.startsWith(FIXTURE_SOURCE_PREFIX)) {
    problems.push(
      'INV-PARAM-03: la versión declara `isFixture: false` pero su `source` la marca como dato de prueba.',
    );
  }

  if (version.status === ParameterVersionStatus.PUBLISHED) {
    if (version.preparedByUserId === null || version.approvedByUserId === null) {
      problems.push(
        'INV-PARAM-02: publicar exige preparador y aprobador identificados (CON-11, ADM-02).',
      );
    } else if (version.preparedByUserId === version.approvedByUserId) {
      problems.push(
        'INV-PARAM-02: doble control — quien prepara los parámetros no puede ser quien los aprueba (CON-11).',
      );
    }
  }

  if (version.categories.length === 0) {
    problems.push(
      'Una versión de parámetros sin escalas de categoría no permite liquidar (LIQ-03).',
    );
  }

  const seen = new Set<string>();
  for (const scale of version.categories) {
    const key = `${scale.categoryCode}::${scale.liveInMode}`;
    if (seen.has(key)) {
      problems.push(`Escala duplicada para ${scale.categoryCode} / ${scale.liveInMode}.`);
    }
    seen.add(key);
  }

  // Los tramos de antigüedad tienen que resolver a una sola respuesta por año.
  if (version.seniority.enabled) {
    const tiers = [...version.seniority.tiers].sort(
      (a, b) => a.fromCompletedYears - b.fromCompletedYears,
    );
    for (let i = 1; i < tiers.length; i += 1) {
      const previous = tiers[i - 1];
      const current = tiers[i];
      if (previous === undefined || current === undefined) continue;
      if (previous.toCompletedYears === null) {
        problems.push('Un tramo de antigüedad abierto debe ser el último.');
      } else if (current.fromCompletedYears <= previous.toCompletedYears) {
        problems.push(
          `Los tramos de antigüedad se solapan entre ${previous.fromCompletedYears} y ${current.fromCompletedYears} años.`,
        );
      }
    }
  }

  return problems;
}
