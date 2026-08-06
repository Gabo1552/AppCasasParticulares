/**
 * @casas/contracts — esquemas Zod compartidos entre web, móvil y API.
 *
 * Un solo esquema valida el request en el backend, tipa el cliente y genera la
 * documentación OpenAPI. Si un campo cambia, los tres rompen en el mismo commit —
 * que es exactamente lo que se busca (ADR 0001, decisión D2).
 */

import { z } from 'zod';

// ─── Primitivos del dominio ──────────────────────────────────────────────────

/**
 * Importe monetario: **string decimal**, nunca `number`.
 *
 * JSON no tiene decimal exacto. Aceptar un `number` acá reintroduciría el error
 * binario que se evita en todo el resto de la cadena (RN-13, principio 11).
 */
export const moneySchema = z
  .string()
  .regex(/^-?\d{1,15}(\.\d{1,4})?$/, 'El importe debe ser un decimal con hasta 4 decimales.');

export const currencySchema = z.literal('ARS');

export const moneyValueSchema = z.object({
  amount: moneySchema,
  currency: currencySchema,
});

export const uuidSchema = z.string().uuid();

export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD.');

export const isoDateTimeSchema = z.string().datetime({ offset: true });

/** Minutos enteros no negativos. El tiempo no se mide en horas fraccionarias. */
export const minutesSchema = z.number().int().min(0);

/**
 * CUIL argentino. Se valida el formato y el dígito verificador.
 * Los seeds usan valores ficticios construidos para pasar esta validación.
 */
export const cuilSchema = z
  .string()
  .regex(/^\d{2}-?\d{8}-?\d$/, 'El CUIL debe tener 11 dígitos.')
  .refine((value) => isValidCuil(value), 'El dígito verificador del CUIL no es válido.');

export function isValidCuil(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11) return false;

  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    sum += Number(digits[i]) * (weights[i] ?? 0);
  }
  const remainder = sum % 11;
  const expected = remainder === 0 ? 0 : remainder === 1 ? 9 : 11 - remainder;
  return expected === Number(digits[10]);
}

/**
 * Representación de una cuenta bancaria en la API: **siempre enmascarada**.
 * No existe un esquema de respuesta que devuelva el número completo (INV-PAGO-03).
 */
export const maskedAccountSchema = z.object({
  kind: z.enum(['CBU', 'CVU']),
  last4: z.string().length(4),
  alias: z.string().nullable(),
  masked: z.string(),
});

// ─── Enumeraciones ───────────────────────────────────────────────────────────

export const platformRoleSchema = z.enum([
  'FAMILY_EMPLOYER',
  'WORKER',
  'ACCOUNTANT',
  'ACCOUNTANT_MANAGER',
  'OPERATIONS_AGENT',
  'PLATFORM_ADMIN',
  'SUPPORT_AGENT',
]);

export const employmentRelationshipStatusSchema = z.enum([
  'DRAFT',
  'PENDING_WORKER_ACCEPTANCE',
  'PENDING_CONFIGURATION',
  'ACTIVE',
  'SUSPENDED',
  'TERMINATED',
  'ARCHIVED',
]);

export const payrollPeriodStatusSchema = z.enum([
  'OPEN',
  'PENDING_ATTENDANCE_APPROVAL',
  'READY_FOR_CALCULATION',
  'CALCULATED',
  'PENDING_PROFESSIONAL_REVIEW',
  'OBSERVED',
  'APPROVED',
  'PENDING_ARCA',
  'ARCA_DOCUMENT_IMPORTED',
  'PENDING_PAYMENT',
  'PAID',
  'RECONCILED',
  'RECTIFICATION_REQUIRED',
  'CLOSED',
]);

export const timeEntryStatusSchema = z.enum([
  'PENDING_SYNC',
  'RECORDED',
  'PENDING_APPROVAL',
  'APPROVED',
  'DISPUTED',
  'CORRECTED',
  'REJECTED',
]);

export const clockInMethodSchema = z.enum(['BUTTON', 'QR', 'PIN', 'PROXIMITY', 'MANUAL']);
export const liveInModeSchema = z.enum(['WITH_WITHDRAWAL', 'WITHOUT_WITHDRAWAL']);
export const remunerationSchemeSchema = z.enum(['MONTHLY', 'HOURLY']);

// ─── Identidad ───────────────────────────────────────────────────────────────

export const registerRequestSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(8).max(20).optional(),
    displayName: z.string().min(2).max(120),
    password: z.string().min(12, 'La contraseña debe tener al menos 12 caracteres.'),
    role: z.enum(['FAMILY_EMPLOYER', 'WORKER']),
    acceptedConsentDocumentIds: z.array(uuidSchema).min(1),
  })
  .strict()
  .refine(
    (value) => value.email !== undefined || value.phone !== undefined,
    'Se requiere correo o teléfono (SEG-01).',
  );

export const verifyOtpRequestSchema = z
  .object({
    destination: z.string().min(3),
    code: z.string().length(6),
  })
  .strict();

export const loginRequestSchema = z
  .object({
    identifier: z.string().min(3),
    password: z.string().min(1),
    mfaCode: z.string().length(6).optional(),
  })
  .strict();

// ─── Domicilio y relación laboral ────────────────────────────────────────────

export const createHouseholdRequestSchema = z
  .object({
    label: z.string().min(2).max(120),
    addressLine: z.string().min(3).max(240),
    city: z.string().min(2).max(120),
    province: z.string().min(2).max(120),
    postalCode: z.string().min(3).max(12),
    timezone: z.string().default('America/Argentina/Buenos_Aires'),
    unfavorableZoneCode: z.string().max(60).nullable().default(null),
  })
  .strict();

export const inviteWorkerRequestSchema = z
  .object({
    householdId: uuidSchema,
    workerEmail: z.string().email().optional(),
    workerPhone: z.string().min(8).max(20).optional(),
    startDate: localDateSchema,
    message: z.string().max(500).optional(),
  })
  .strict()
  .refine(
    (value) => value.workerEmail !== undefined || value.workerPhone !== undefined,
    'Se requiere correo o teléfono de la trabajadora para invitarla.',
  );

export const configureRelationshipRequestSchema = z
  .object({
    effectiveFrom: localDateSchema,
    categoryCode: z.string().min(1).max(60),
    liveInMode: liveInModeSchema,
    remunerationScheme: remunerationSchemeSchema,
    agreedRemuneration: moneySchema,
    weeklyHours: z.number().int().min(1).max(168).nullable().default(null),
    changeReason: z.string().max(500).optional(),
    /** Versión esperada, para control de concurrencia optimista (decisión D11). */
    expectedVersion: z.number().int().min(0),
  })
  .strict();

export const workScheduleRuleSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
    breakMinutes: z.number().int().min(0).max(720).default(0),
  })
  .strict()
  .refine(
    (value) => value.endMinute > value.startMinute,
    'La salida debe ser posterior a la entrada.',
  );

export const createWorkScheduleRequestSchema = z
  .object({
    effectiveFrom: localDateSchema,
    allowedMethods: z.array(clockInMethodSchema).min(1),
    defaultMethod: clockInMethodSchema,
    roundingMinutes: z.number().int().min(0).max(60).default(0),
    toleranceMinutes: z.number().int().min(0).max(120).default(0),
    rules: z.array(workScheduleRuleSchema).min(1),
  })
  .strict()
  .refine(
    (value) => value.allowedMethods.includes(value.defaultMethod),
    'El método por defecto debe estar entre los métodos habilitados.',
  );

// ─── Fichaje ─────────────────────────────────────────────────────────────────

export const clockEventRequestSchema = z
  .object({
    kind: z.enum(['CLOCK_IN', 'CLOCK_OUT', 'BREAK_START', 'BREAK_END']),
    /** Hora declarada por el dispositivo. El servidor guarda además la de recepción. */
    declaredAt: isoDateTimeSchema,
    timezone: z.string().min(3),
    method: clockInMethodSchema,
    deviceId: z.string().max(120).optional(),
    deviceLabel: z.string().max(120).optional(),
    /**
     * Ubicación **sólo del instante del fichaje**, opcional (FIC-09).
     * Si el usuario no la consiente, el fichaje se completa por QR o PIN.
     */
    location: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        accuracyMeters: z.number().int().min(0).max(10000),
      })
      .strict()
      .optional(),
    /** Idempotencia del fichaje offline. La genera el cliente (FIC-03). */
    clientIdempotencyKey: uuidSchema,
    evidence: z.record(z.string()).optional(),
    note: z.string().max(500).optional(),
  })
  .strict();

export const requestAttendanceCorrectionSchema = z
  .object({
    timeEntryId: uuidSchema,
    reason: z.string().min(5).max(500),
    proposedAt: isoDateTimeSchema,
  })
  .strict();

// ─── Liquidación ─────────────────────────────────────────────────────────────

export const payrollLineItemResponseSchema = z.object({
  code: z.string(),
  label: z.string(),
  sign: z.enum(['CREDIT', 'DEBIT', 'INFORMATIONAL']),
  calculationBase: moneySchema,
  quantity: z.string().nullable(),
  rate: z.string().nullable(),
  amount: moneySchema,
  formulaId: z.string(),
  formulaExplanation: z.string(),
  parameterRef: z.string().nullable(),
});

export const payrollCalculationResponseSchema = z.object({
  payrollPeriodId: uuidSchema,
  payrollVersionId: uuidSchema,
  versionNumber: z.number().int().min(1),
  status: payrollPeriodStatusSchema,
  lineItems: z.array(payrollLineItemResponseSchema),
  grossEstimate: moneySchema,
  deductionsEstimate: moneySchema,
  netEstimate: moneySchema,
  currency: currencySchema,
  warnings: z.array(z.object({ code: z.string(), message: z.string() })),
  blockingErrors: z.array(z.object({ code: z.string(), message: z.string() })),
  parameterVersionId: uuidSchema,
  /** Se propaga a la UI para no presentar un fixture como una liquidación oficial. */
  usedFixtureParameters: z.boolean(),
  engineVersion: z.string(),
});

// ─── Pagos ───────────────────────────────────────────────────────────────────

export const registerPaymentRequestSchema = z
  .object({
    payrollPeriodId: uuidSchema,
    payrollVersionId: uuidSchema,
    workerBankAccountId: uuidSchema,
    amount: moneySchema,
    paidAt: isoDateTimeSchema,
    externalReference: z.string().max(120).optional(),
    proofDocumentId: uuidSchema.optional(),
    /** Idempotencia: un reintento no genera un segundo pago (PAG-07). */
    idempotencyKey: uuidSchema,
  })
  .strict();

// ─── Errores ─────────────────────────────────────────────────────────────────

/** Forma única de error de la API. Los clientes reaccionan al `code`, no al mensaje. */
export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  correlationId: z.string().optional(),
});

// ─── Tipos inferidos ─────────────────────────────────────────────────────────

export type MoneyValue = z.infer<typeof moneyValueSchema>;
export type MaskedAccountDto = z.infer<typeof maskedAccountSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type CreateHouseholdRequest = z.infer<typeof createHouseholdRequestSchema>;
export type InviteWorkerRequest = z.infer<typeof inviteWorkerRequestSchema>;
export type ConfigureRelationshipRequest = z.infer<typeof configureRelationshipRequestSchema>;
export type CreateWorkScheduleRequest = z.infer<typeof createWorkScheduleRequestSchema>;
export type ClockEventRequest = z.infer<typeof clockEventRequestSchema>;
export type RegisterPaymentRequest = z.infer<typeof registerPaymentRequestSchema>;
export type PayrollCalculationResponse = z.infer<typeof payrollCalculationResponseSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
