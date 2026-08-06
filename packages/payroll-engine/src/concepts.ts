/**
 * Catálogo de códigos de concepto y de fórmula.
 *
 * Los códigos son estables: aparecen en la preliquidación persistida, en la
 * comparación contra el recibo oficial (ARC-07) y en la exportación. Cambiar uno
 * rompería la conciliación de períodos históricos.
 */

export const ConceptCode = {
  BASE_MONTHLY: 'BASE_MONTHLY',
  BASE_HOURLY: 'BASE_HOURLY',
  OVERTIME: 'OVERTIME',
  HOLIDAY_WORKED: 'HOLIDAY_WORKED',
  SENIORITY: 'SENIORITY',
  UNFAVORABLE_ZONE: 'UNFAVORABLE_ZONE',
  VACATION: 'VACATION',
  ANNUAL_BONUS: 'ANNUAL_BONUS',
  ABSENCE_DEDUCTION: 'ABSENCE_DEDUCTION',
  UNPAID_LEAVE_DEDUCTION: 'UNPAID_LEAVE_DEDUCTION',
  ADVANCE_DEDUCTION: 'ADVANCE_DEDUCTION',
  WORKER_CONTRIBUTION: 'WORKER_CONTRIBUTION',
  EMPLOYER_CONTRIBUTION: 'EMPLOYER_CONTRIBUTION',
  WORK_RISK_INSURANCE: 'WORK_RISK_INSURANCE',
  ADDITIONAL: 'ADDITIONAL',
} as const;
export type ConceptCode = (typeof ConceptCode)[keyof typeof ConceptCode];

/**
 * Identificadores de fórmula. Versionados aparte del motor: si una fórmula cambia
 * de manera incompatible, se crea `...:v2` y las liquidaciones históricas siguen
 * refiriendo a `v1`.
 */
export const FormulaId = {
  BASE_MONTHLY: 'base.monthly:v1',
  BASE_MONTHLY_PRORATED: 'base.monthly.prorated:v1',
  BASE_HOURLY: 'base.hourly:v1',
  HOURLY_VALUE_FROM_MONTHLY: 'hourly-value.from-monthly:v1',
  OVERTIME: 'overtime.multiplier:v1',
  HOLIDAY_WORKED: 'holiday.worked-multiplier:v1',
  SENIORITY: 'seniority.tier-percentage:v1',
  UNFAVORABLE_ZONE: 'unfavorable-zone.percentage:v1',
  VACATION: 'vacation.daily-value:v1',
  ANNUAL_BONUS: 'annual-bonus.best-semester:v1',
  ABSENCE_DEDUCTION: 'absence.daily-deduction:v1',
  ADVANCE_DEDUCTION: 'advance.fixed-amount:v1',
  CONTRIBUTION_PERCENTAGE: 'contribution.percentage:v1',
  CONTRIBUTION_FIXED: 'contribution.fixed:v1',
  WORK_RISK_PERCENTAGE: 'work-risk.percentage:v1',
  WORK_RISK_FIXED: 'work-risk.fixed:v1',
  ADDITIONAL_FIXED: 'additional.fixed:v1',
} as const;
export type FormulaId = (typeof FormulaId)[keyof typeof FormulaId];

/** Códigos de advertencia. No bloquean el avance del período. */
export const WarningCode = {
  FIXTURE_PARAMETERS: 'FIXTURE_PARAMETERS',
  NO_WORKED_TIME: 'NO_WORKED_TIME',
  UNAPPROVED_EVENT_IGNORED: 'UNAPPROVED_EVENT_IGNORED',
  UNKNOWN_OVERTIME_KIND: 'UNKNOWN_OVERTIME_KIND',
  SENIORITY_TIER_NOT_FOUND: 'SENIORITY_TIER_NOT_FOUND',
  UNFAVORABLE_ZONE_NOT_FOUND: 'UNFAVORABLE_ZONE_NOT_FOUND',
  RULE_DISABLED: 'RULE_DISABLED',
  DISCOUNT_NOT_ACCEPTED: 'DISCOUNT_NOT_ACCEPTED',
  NEGATIVE_NET: 'NEGATIVE_NET',
} as const;
export type WarningCode = (typeof WarningCode)[keyof typeof WarningCode];

/** Códigos de error bloqueante. Impiden aprobar el período (INV-PAY-04). */
export const BlockingErrorCode = {
  /** RN-07, LIQ-10: la remuneración pactada está por debajo del mínimo vigente. */
  BELOW_LEGAL_MINIMUM: 'BELOW_LEGAL_MINIMUM',
  CATEGORY_SCALE_NOT_FOUND: 'CATEGORY_SCALE_NOT_FOUND',
  PARAMETER_VERSION_INVALID: 'PARAMETER_VERSION_INVALID',
  PARAMETER_VERSION_NOT_EFFECTIVE: 'PARAMETER_VERSION_NOT_EFFECTIVE',
  PARAMETER_VERSION_NOT_PUBLISHED: 'PARAMETER_VERSION_NOT_PUBLISHED',
  INVALID_PERIOD: 'INVALID_PERIOD',
  UNJUSTIFIED_DISCOUNT: 'UNJUSTIFIED_DISCOUNT',
} as const;
export type BlockingErrorCode = (typeof BlockingErrorCode)[keyof typeof BlockingErrorCode];
