/**
 * @casas/payroll-engine — motor de liquidación.
 *
 * Librería de dominio **pura**: sin interfaz, sin HTTP, sin base de datos. Recibe
 * todo lo que necesita —incluida la versión completa de parámetros normativos— y
 * devuelve una preliquidación explicada con su traza (ADR 0001, decisión D3).
 *
 * Lo que devuelve **no es un recibo de sueldo**: el recibo oficial se emite en ARCA
 * (principio 7 del encargo).
 */

export { calculatePayroll, completedYearsBetween } from './engine';

export {
  ConceptCode,
  FormulaId,
  WarningCode,
  BlockingErrorCode,
} from './concepts';

export {
  FIXTURE_SOURCE_PREFIX,
  LiveInMode,
  ParameterVersionStatus,
  RemunerationScheme,
  findCategoryScale,
  validateParameterVersion,
  type AbsenceRule,
  type AnnualBonusRule,
  type CategoryScale,
  type ContributionItem,
  type HolidayRule,
  type OvertimeKind,
  type OvertimeRule,
  type PayrollParameterVersion,
  type RoundingPolicy,
  type SeniorityRule,
  type SeniorityTier,
  type UnfavorableZoneRule,
  type VacationRule,
  type WorkRiskRule,
} from './parameters';

export {
  ConceptSign,
  ENGINE_VERSION,
  EmploymentEventType,
  PeriodType,
  type AdditionalConceptInput,
  type AnnualBonusInput,
  type EmploymentEventInput,
  type OvertimeEntry,
  type PayrollBlockingError,
  type PayrollInput,
  type PayrollLineItem,
  type PayrollObligation,
  type PayrollPeriodInput,
  type PayrollResult,
  type PayrollTraceStep,
  type PayrollWarning,
} from './types';

/**
 * Fixtures de prueba. **No son valores oficiales.** Ver la advertencia al principio
 * de `src/fixtures/parameter-versions.ts`.
 */
export {
  ALL_FIXTURE_PARAMETER_VERSIONS,
  FIXTURE_CATEGORY,
  FIXTURE_OVERTIME_KIND,
  FIXTURE_PARAMETERS_H1_2026,
  FIXTURE_PARAMETERS_H2_2026,
} from './fixtures/parameter-versions';
