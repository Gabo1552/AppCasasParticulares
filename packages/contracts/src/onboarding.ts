import { z } from 'zod';
import { localDateSchema, moneySchema, uuidSchema } from './primitives';

/**
 * Contratos del recorrido de onboarding (Etapa 3, pasos 1 a 6).
 *
 * Todos los esquemas de request son `.strict()`: un campo desconocido se rechaza
 * en lugar de ignorarse. Es lo que impide que alguien intente colar `employerId`,
 * `role` o `status` en un body y que un servicio lo tome por descuido.
 */

// ─── Identidad ───────────────────────────────────────────────────────────────

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Ingresá un correo electrónico válido.')
  .max(254);

export const requestCodeSchema = z.object({ email: emailSchema }).strict();

export const verifyCodeSchema = z
  .object({
    email: emailSchema,
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'El código tiene 6 dígitos.'),
    /** Token de invitación, si la persona llegó desde un enlace. */
    invitationToken: z.string().min(10).max(200).optional(),
  })
  .strict();

// ─── Perfiles ────────────────────────────────────────────────────────────────

const personNameSchema = z
  .string()
  .trim()
  .min(2, 'Debe tener al menos 2 caracteres.')
  .max(80)
  .regex(/^[\p{L}\p{M}'\-. ]+$/u, 'Sólo se admiten letras, espacios, apóstrofos y guiones.');

/** Teléfono argentino en formato flexible: se guarda tal como se ingresa. */
const phoneSchema = z
  .string()
  .trim()
  .min(8, 'El teléfono es demasiado corto.')
  .max(25)
  .regex(/^[0-9+\-() ]+$/, 'Sólo se admiten números y los signos + - ( ).');

const timezoneSchema = z.string().trim().min(3).max(64);

/**
 * Aceptación de términos y privacidad.
 *
 * Se exige `true` explícito: un checkbox sin marcar no puede pasar como aceptado,
 * y el servidor guarda la versión del texto que la persona vio (SEG-04).
 */
const consentsSchema = z
  .object({
    acceptedTerms: z.literal(true, {
      errorMap: () => ({ message: 'Tenés que aceptar los términos y condiciones.' }),
    }),
    acceptedPrivacyPolicy: z.literal(true, {
      errorMap: () => ({ message: 'Tenés que aceptar la política de privacidad.' }),
    }),
  })
  .strict();

export const createProfileSchema = z
  .object({
    firstName: personNameSchema,
    lastName: personNameSchema,
    phone: phoneSchema,
    timezone: timezoneSchema.default('America/Argentina/Buenos_Aires'),
    consents: consentsSchema,
  })
  .strict();

export const updateProfileSchema = z
  .object({
    firstName: personNameSchema.optional(),
    lastName: personNameSchema.optional(),
    phone: phoneSchema.optional(),
    timezone: timezoneSchema.optional(),
  })
  .strict();

// ─── Domicilio laboral ───────────────────────────────────────────────────────

export const householdSchema = z
  .object({
    label: z.string().trim().min(2, 'Poné un alias para reconocerlo.').max(60),
    street: z.string().trim().min(2).max(120),
    streetNumber: z.string().trim().min(1).max(12),
    floor: z.string().trim().max(10).optional(),
    apartment: z.string().trim().max(10).optional(),
    city: z.string().trim().min(2).max(80),
    province: z.string().trim().min(2).max(80),
    postalCode: z.string().trim().min(4, 'El código postal es demasiado corto.').max(10),
    timezone: timezoneSchema.default('America/Argentina/Buenos_Aires'),
    accessInstructions: z.string().trim().max(500).optional(),
  })
  .strict();

export const updateHouseholdSchema = householdSchema.partial().strict();

// ─── Invitaciones ────────────────────────────────────────────────────────────

export const createInvitationSchema = z
  .object({
    householdId: uuidSchema,
    workerEmail: emailSchema,
    workerName: z.string().trim().min(2).max(120).optional(),
    /** Días de validez. Por defecto una semana. */
    expiresInDays: z.number().int().min(1).max(30).default(7),
  })
  .strict();

export const revokeInvitationSchema = z
  .object({ reason: z.string().trim().min(3).max(300).optional() })
  .strict();

export const acceptInvitationSchema = z.object({ token: z.string().min(10).max(200) }).strict();
export const rejectInvitationSchema = z
  .object({ token: z.string().min(10).max(200), reason: z.string().trim().max(300).optional() })
  .strict();

// ─── Condiciones de la relación laboral ──────────────────────────────────────

export const liveInModeSchema2 = z.enum(['WITH_WITHDRAWAL', 'WITHOUT_WITHDRAWAL']);
export const remunerationSchemeSchema2 = z.enum(['MONTHLY', 'HOURLY']);

export const relationshipConditionsSchema = z
  .object({
    plannedStartDate: localDateSchema,
    categoryCode: z.string().trim().min(1).max(60),
    liveInMode: liveInModeSchema2,
    remunerationScheme: remunerationSchemeSchema2,
    /**
     * String decimal, nunca number: JSON no tiene decimal exacto y convertir a
     * number reintroduce el error binario que se evita en toda la cadena (RN-13).
     */
    agreedRemuneration: moneySchema.refine(
      (value) => Number(value) > 0,
      'La remuneración tiene que ser mayor a cero.',
    ),
    weeklyHours: z.number().int().min(1).max(168),
    paymentDayOfMonth: z.number().int().min(1).max(31).optional(),
    requiresProfessionalReview: z.boolean().default(false),
    adminNotes: z.string().trim().max(1000).optional(),
    changeReason: z.string().trim().max(300).optional(),
  })
  .strict();

export const acceptConditionsSchema = z.object({}).strict();
export const rejectConditionsSchema = z
  .object({ reason: z.string().trim().min(3, 'Contá brevemente el motivo.').max(300) })
  .strict();

// ─── Calendario semanal ──────────────────────────────────────────────────────

/** Hora local del domicilio, en formato HH:MM de 24 horas. */
const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usá el formato HH:MM.');

export const workScheduleDaySchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: timeOfDaySchema,
    endTime: timeOfDaySchema,
    breakMinutes: z.number().int().min(0).max(480).default(0),
  })
  .strict()
  .refine((day) => toMinutes(day.endTime) > toMinutes(day.startTime), {
    message: 'La hora de salida tiene que ser posterior a la de entrada.',
    path: ['endTime'],
  })
  .refine((day) => day.breakMinutes < toMinutes(day.endTime) - toMinutes(day.startTime), {
    message: 'La pausa no puede durar tanto como la jornada.',
    path: ['breakMinutes'],
  });

export const putWorkScheduleSchema = z
  .object({
    effectiveFrom: localDateSchema,
    days: z.array(workScheduleDaySchema).min(1, 'Configurá al menos un día de trabajo.').max(7),
  })
  .strict()
  .refine((input) => new Set(input.days.map((d) => d.dayOfWeek)).size === input.days.length, {
    message: 'Hay más de un bloque para el mismo día.',
    path: ['days'],
  });

export function toMinutes(time: string): number {
  const [hours = '0', minutes = '0'] = time.split(':');
  return Number(hours) * 60 + Number(minutes);
}

export function toTimeOfDay(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type RequestCodeInput = z.infer<typeof requestCodeSchema>;
export type VerifyCodeInput = z.infer<typeof verifyCodeSchema>;
export type CreateProfileInput = z.infer<typeof createProfileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type HouseholdInput = z.infer<typeof householdSchema>;
export type UpdateHouseholdInput = z.infer<typeof updateHouseholdSchema>;
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type RelationshipConditionsInput = z.infer<typeof relationshipConditionsSchema>;
export type PutWorkScheduleInput = z.infer<typeof putWorkScheduleSchema>;
export type WorkScheduleDayInput = z.infer<typeof workScheduleDaySchema>;
