import { z } from 'zod';
import { moneySchema, uuidSchema } from './primitives';

/**
 * Preliquidación de un período mensual.
 *
 * **Todos los importes viajan como string decimal**, nunca como number: un
 * `number` de JavaScript no puede representar 0.1 exactamente y en dinero eso no
 * es un detalle (RN-13, principio 5 del encargo).
 *
 * Lo que describen estos esquemas **no es un recibo de sueldo**. El recibo
 * oficial se emite en ARCA; esto es el cálculo que la familia usa para informarlo
 * y que la trabajadora puede revisar (principio 7).
 */

export const conceptSignSchema = z.enum(['CREDIT', 'DEBIT', 'INFORMATIONAL']);

/**
 * Una línea del detalle.
 *
 * Lleva mucho más que un importe porque LIQ-14 exige que cada concepto muestre
 * su fórmula, la base sobre la que se aplicó y de qué parámetro salió. Sin eso, la
 * familia no puede entender qué está aprobando ni el contador puede revisarlo.
 */
export const payrollLineItemViewSchema = z.object({
  ordinal: z.number().int().positive(),
  code: z.string().min(1),
  label: z.string().min(1),
  sign: conceptSignSchema,
  calculationBase: moneySchema,
  quantity: moneySchema.nullable(),
  rate: z.string().nullable(),
  amount: moneySchema,
  formulaId: z.string().min(1),
  formulaExplanation: z.string().min(1),
  parameterRef: z.string().nullable(),
});

export const payrollWarningViewSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
});

/** Aporte o contribución estimada. El importe exigible lo determina ARCA. */
export const payrollObligationViewSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  borneBy: z.enum(['WORKER', 'EMPLOYER']),
  calculationBase: moneySchema,
  rate: z.string().nullable(),
  amount: moneySchema,
  parameterRef: z.string(),
  isEstimate: z.literal(true),
});

export const payrollCalculationViewSchema = z.object({
  id: uuidSchema,
  payrollPeriodId: uuidSchema,
  versionNumber: z.number().int().positive(),
  engineVersion: z.string().min(1),

  grossEstimate: moneySchema,
  deductionsEstimate: moneySchema,
  netEstimate: moneySchema,
  currency: z.string().min(1),

  /**
   * `true` cuando el cálculo usó parámetros de prueba. Viaja hasta la UI a
   * propósito: ningún importe puede presentarse como oficial mientras un contador
   * matriculado no haya publicado los valores reales.
   */
  usedFixtureParameters: z.boolean(),
  calculatedAt: z.string().datetime(),

  lineItems: z.array(payrollLineItemViewSchema),
  warnings: z.array(payrollWarningViewSchema),
  estimatedObligations: z.array(payrollObligationViewSchema),
});

export type ConceptSignValue = z.infer<typeof conceptSignSchema>;
export type PayrollLineItemView = z.infer<typeof payrollLineItemViewSchema>;
export type PayrollWarningView = z.infer<typeof payrollWarningViewSchema>;
export type PayrollObligationView = z.infer<typeof payrollObligationViewSchema>;
export type PayrollCalculationView = z.infer<typeof payrollCalculationViewSchema>;
