import { z } from 'zod';
import { isoDateTimeSchema, localDateSchema, uuidSchema } from './primitives';

/**
 * Contratos de Fichaje y Asistencia (E3.7–E3.8).
 *
 * Cubre:
 * - Fichaje de entrada (clock-in) y salida (clock-out) por la trabajadora.
 * - Revisión, solicitud de correcciones y aprobación por la familia.
 */

export const clockInMethodSchema = z.enum(['BUTTON', 'QR', 'PIN', 'PROXIMITY', 'MANUAL']);
export type ClockInMethod = z.infer<typeof clockInMethodSchema>;

export const workDayStatusSchema = z.enum([
  'OPEN',
  'PENDING_APPROVAL',
  'APPROVED',
  'DISPUTED',
  'LOCKED',
]);
export type WorkDayStatus = z.infer<typeof workDayStatusSchema>;

export const attendanceCorrectionStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED']);
export type AttendanceCorrectionStatus = z.infer<typeof attendanceCorrectionStatusSchema>;

export const clockInRequestSchema = z
  .object({
    declaredAt: isoDateTimeSchema.optional(),
    timezone: z.string().trim().min(3).max(64).optional(),
    method: clockInMethodSchema.default('BUTTON'),
    deviceId: z.string().max(120).optional(),
    deviceLabel: z.string().max(120).optional(),
    location: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        accuracyMeters: z.number().int().min(0).max(10000),
      })
      .strict()
      .optional(),
    clientIdempotencyKey: uuidSchema.optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export const clockOutRequestSchema = z
  .object({
    declaredAt: isoDateTimeSchema.optional(),
    clientIdempotencyKey: uuidSchema.optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export const approveAttendanceSchema = z
  .object({
    expectedVersion: z.number().int().min(0),
  })
  .strict();

export const requestAttendanceCorrectionSchema = z
  .object({
    proposedClockInAt: isoDateTimeSchema,
    proposedClockOutAt: isoDateTimeSchema,
    reason: z.string().trim().min(3, 'Contá brevemente el motivo de la corrección.').max(500),
    expectedVersion: z.number().int().min(0),
  })
  .strict()
  .refine(
    (val) => new Date(val.proposedClockOutAt) > new Date(val.proposedClockInAt),
    'La hora de salida propuesta debe ser posterior a la de entrada.',
  );

export const resolveAttendanceCorrectionSchema = z
  .object({
    reason: z.string().trim().max(500).optional(),
    expectedVersion: z.number().int().min(0),
  })
  .strict();

export const attendanceListQuerySchema = z
  .object({
    from: localDateSchema.optional(),
    to: localDateSchema.optional(),
    status: workDayStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    page: z.coerce.number().int().min(1).default(1),
  })
  .strict();

export type ClockInRequest = z.infer<typeof clockInRequestSchema>;
export type ClockOutRequest = z.infer<typeof clockOutRequestSchema>;
export type ApproveAttendanceRequest = z.infer<typeof approveAttendanceSchema>;
export type RequestAttendanceCorrectionInput = z.infer<typeof requestAttendanceCorrectionSchema>;
export type ResolveAttendanceCorrectionInput = z.infer<typeof resolveAttendanceCorrectionSchema>;
export type AttendanceListQuery = z.infer<typeof attendanceListQuerySchema>;

export interface TimeEntryItemView {
  id: string;
  kind: 'CLOCK_IN' | 'CLOCK_OUT' | 'BREAK_START' | 'BREAK_END';
  status: string;
  declaredAt: string;
  receivedAt: string;
  method: string;
  note: string | null;
  correctsTimeEntryId: string | null;
}

export interface AttendanceCorrectionItemView {
  id: string;
  status: AttendanceCorrectionStatus;
  requestedByUserId: string;
  reason: string;
  originalClockInAt: string | null;
  originalClockOutAt: string | null;
  proposedClockInAt: string | null;
  proposedClockOutAt: string | null;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  resolutionNote: string | null;
  createdAt: string;
  version: number;
}

export interface AttendanceView {
  id: string;
  relationshipId: string;
  date: string;
  status: WorkDayStatus;
  clockInAt: string | null;
  clockOutAt: string | null;
  effectiveClockInAt: string | null;
  effectiveClockOutAt: string | null;
  realMinutes: number;
  computableMinutes: number;
  approvedMinutes: number | null;
  breakMinutes: number;
  approvedAt: string | null;
  approvedByUserId: string | null;
  entries: TimeEntryItemView[];
  corrections: AttendanceCorrectionItemView[];
  version: number;
  createdAt: string;
  updatedAt: string;
}
