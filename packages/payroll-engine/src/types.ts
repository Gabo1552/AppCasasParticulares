import type { LocalDate } from '@casas/domain';
import type { LiveInMode, PayrollParameterVersion, RemunerationScheme } from './parameters';

/** Versión del motor. Cambia cuando cambia una fórmula, no cuando cambia un parámetro. */
export const ENGINE_VERSION = '0.1.0';

export const PeriodType = {
  MONTHLY: 'MONTHLY',
  EXTRAORDINARY: 'EXTRAORDINARY',
  FINAL: 'FINAL',
} as const;
export type PeriodType = (typeof PeriodType)[keyof typeof PeriodType];

export interface PayrollPeriodInput {
  readonly year: number;
  /** 1-12. */
  readonly month: number;
  readonly periodType: PeriodType;
  readonly from: LocalDate;
  readonly to: LocalDate;
  /** Días del mes según el calendario, para prorrateos. */
  readonly calendarDays: number;
}

/** Horas extra declaradas, agrupadas por tipo del catálogo de parámetros. */
export interface OvertimeEntry {
  readonly kindCode: string;
  readonly minutes: number;
}

export const EmploymentEventType = {
  ABSENCE_UNJUSTIFIED: 'ABSENCE_UNJUSTIFIED',
  ABSENCE_JUSTIFIED: 'ABSENCE_JUSTIFIED',
  PAID_LEAVE: 'PAID_LEAVE',
  UNPAID_LEAVE: 'UNPAID_LEAVE',
  VACATION: 'VACATION',
  ADVANCE: 'ADVANCE',
} as const;
export type EmploymentEventType =
  (typeof EmploymentEventType)[keyof typeof EmploymentEventType];

export interface EmploymentEventInput {
  readonly id: string;
  readonly type: EmploymentEventType;
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly days: number;
  /** Sólo para adelantos y descuentos: decimal exacto como string. */
  readonly amount?: string;
  readonly approved: boolean;
}

/** Concepto adicional configurable, del catálogo permitido (LIQ-09). */
export interface AdditionalConceptInput {
  readonly code: string;
  readonly label: string;
  readonly amount: string;
  readonly sign: 'CREDIT' | 'DEBIT';
  /** LIQ-09: un descuento sin fundamento no se aplica. */
  readonly justification: string;
  readonly acceptedByWorker: boolean;
}

export interface AnnualBonusInput {
  readonly applies: boolean;
  /** Mejor remuneración mensual del semestre, decimal exacto como string. */
  readonly bestSemesterRemuneration: string;
  /** Meses trabajados del semestre, para la proporcionalidad. */
  readonly monthsWorkedInSemester: number;
}

/**
 * Entrada del motor.
 *
 * Todo lo que el cálculo necesita llega por acá — incluida la versión completa de
 * parámetros. El motor **nunca va a buscar** un dato: si no está en la entrada, no
 * existe. Es lo que lo vuelve puro, determinista y reproducible (ADR 0001, D3).
 */
export interface PayrollInput {
  readonly employmentRelationshipId: string;
  readonly payrollPeriodId: string;
  readonly period: PayrollPeriodInput;

  readonly categoryCode: string;
  readonly liveInMode: LiveInMode;
  readonly remunerationScheme: RemunerationScheme;
  /** Remuneración pactada, decimal exacto como string. */
  readonly agreedRemuneration: string;

  readonly parameters: PayrollParameterVersion;

  /** Minutos normales computables del período (RN-04: computables, no reales). */
  readonly normalMinutes: number;
  readonly overtime: readonly OvertimeEntry[];
  readonly holidayMinutes: number;

  readonly relationshipStartDate: LocalDate;
  readonly unfavorableZoneCode: string | null;

  readonly events: readonly EmploymentEventInput[];
  readonly annualBonus: AnnualBonusInput;
  readonly additionalConcepts: readonly AdditionalConceptInput[];
}

// ─── Salida ──────────────────────────────────────────────────────────────────

export const ConceptSign = {
  /** Suma al bruto. */
  CREDIT: 'CREDIT',
  /** Resta del bruto. */
  DEBIT: 'DEBIT',
  /** Informativo: no afecta el neto (por ejemplo, contribuciones patronales). */
  INFORMATIONAL: 'INFORMATIONAL',
} as const;
export type ConceptSign = (typeof ConceptSign)[keyof typeof ConceptSign];

/**
 * Una línea de la preliquidación.
 *
 * LIQ-14 exige que cada línea muestre fórmula, datos de entrada, parámetro y redondeo.
 * De ahí que la línea lleve mucho más que un importe: sin la explicación, la familia
 * no puede entender qué está aprobando ni el contador puede revisar.
 */
export interface PayrollLineItem {
  readonly code: string;
  readonly label: string;
  readonly sign: ConceptSign;
  /** Base de cálculo, decimal exacto como string. */
  readonly calculationBase: string;
  /** Cantidad aplicada (horas, días, unidades). `null` si no aplica. */
  readonly quantity: string | null;
  /** Tasa, multiplicador o porcentaje aplicado. `null` si no aplica. */
  readonly rate: string | null;
  /** Importe final del concepto, ya redondeado según la política. */
  readonly amount: string;
  /** Identificador estable de la fórmula usada. */
  readonly formulaId: string;
  /** Explicación legible de la fórmula, en español. */
  readonly formulaExplanation: string;
  /** Qué campo de la versión de parámetros alimentó el cálculo. */
  readonly parameterRef: string | null;
}

export interface PayrollObligation {
  readonly code: string;
  readonly label: string;
  readonly borneBy: 'WORKER' | 'EMPLOYER';
  readonly calculationBase: string;
  readonly rate: string | null;
  readonly amount: string;
  readonly parameterRef: string;
  /** Siempre `true`: el importe exigible lo determina ARCA, no la plataforma. */
  readonly isEstimate: true;
}

export interface PayrollWarning {
  readonly code: string;
  readonly message: string;
  readonly context: Readonly<Record<string, unknown>>;
}

/** Impide avanzar el período (INV-PAY-04, RN-07). */
export interface PayrollBlockingError {
  readonly code: string;
  readonly message: string;
  readonly context: Readonly<Record<string, unknown>>;
}

/** Paso de la traza: qué se calculó, con qué entrada y con qué resultado. */
export interface PayrollTraceStep {
  readonly step: number;
  readonly stage: string;
  readonly description: string;
  readonly inputs: Readonly<Record<string, string>>;
  readonly output: string;
}

export interface PayrollResult {
  readonly employmentRelationshipId: string;
  readonly payrollPeriodId: string;
  readonly period: PayrollPeriodInput;

  readonly lineItems: readonly PayrollLineItem[];
  /** Bruto: suma de créditos. */
  readonly grossEstimate: string;
  /** Total de descuentos a cargo de la trabajadora. */
  readonly deductionsEstimate: string;
  /** Neto estimado. **No es un recibo** (principio 7). */
  readonly netEstimate: string;
  readonly currency: 'ARS';

  readonly estimatedObligations: readonly PayrollObligation[];
  readonly warnings: readonly PayrollWarning[];
  readonly blockingErrors: readonly PayrollBlockingError[];

  /** Versión exacta de parámetros usada (RN-02, LIQ-02). */
  readonly parameterVersionId: string;
  /** `true` si el cálculo usó datos de prueba. Se propaga a la UI. */
  readonly usedFixtureParameters: boolean;
  readonly engineVersion: string;
  readonly trace: readonly PayrollTraceStep[];
}
