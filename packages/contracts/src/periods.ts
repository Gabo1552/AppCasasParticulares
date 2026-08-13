import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './primitives';

export const periodTypeSchema = z.enum(['MONTHLY', 'EXTRAORDINARY', 'FINAL']);
export type PeriodType = z.infer<typeof periodTypeSchema>;

export const createMonthlyPeriodRequestSchema = z
  .object({
    year: z.number().int().min(2020).max(2100),
    month: z.number().int().min(1).max(12),
  })
  .strict();

export type CreateMonthlyPeriodRequest = z.infer<typeof createMonthlyPeriodRequestSchema>;

export const closeAttendancePeriodRequestSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();

export type CloseAttendancePeriodRequest = z.infer<typeof closeAttendancePeriodRequestSchema>;

export const monthlyAttendanceSummarySchema = z.object({
  approvedDays: z.number().int().nonnegative(),
  approvedMinutes: z.number().int().nonnegative(),
  openDays: z.number().int().nonnegative(),
  pendingApprovalDays: z.number().int().nonnegative(),
  disputedDays: z.number().int().nonnegative(),
  totalAttendanceDays: z.number().int().nonnegative(),
});

export type MonthlyAttendanceSummary = z.infer<typeof monthlyAttendanceSummarySchema>;

export const periodAttendanceSnapshotDaySchema = z.object({
  workDayId: uuidSchema,
  workDayVersion: z.number().int().nonnegative(),
  date: z.string(),
  approvedMinutes: z.number().int().positive(),
  approvedClockInAt: isoDateTimeSchema.nullable().optional(),
  approvedClockOutAt: isoDateTimeSchema.nullable().optional(),
  approvedAt: isoDateTimeSchema.nullable().optional(),
});

export type PeriodAttendanceSnapshotDay = z.infer<typeof periodAttendanceSnapshotDaySchema>;

export const periodAttendanceSnapshotPayloadSchema = z.object({
  schemaVersion: z.string(),
  relationshipId: uuidSchema,
  periodId: uuidSchema,
  year: z.number().int(),
  month: z.number().int(),
  days: z.array(periodAttendanceSnapshotDaySchema),
  approvedDays: z.number().int().nonnegative(),
  approvedMinutes: z.number().int().nonnegative(),
});

export type PeriodAttendanceSnapshotPayload = z.infer<typeof periodAttendanceSnapshotPayloadSchema>;

export const periodAttendanceSnapshotViewSchema = z.object({
  id: uuidSchema,
  payrollPeriodId: uuidSchema,
  schemaVersion: z.string(),
  approvedDays: z.number().int().nonnegative(),
  approvedMinutes: z.number().int().nonnegative(),
  hash: z.string(),
  createdAt: isoDateTimeSchema,
  createdByUserId: uuidSchema.nullable().optional(),
  payload: periodAttendanceSnapshotPayloadSchema.optional(),
});

export type PeriodAttendanceSnapshotView = z.infer<typeof periodAttendanceSnapshotViewSchema>;

export const monthlyPeriodViewSchema = z.object({
  id: uuidSchema,
  relationshipId: uuidSchema,
  year: z.number().int(),
  month: z.number().int(),
  periodType: periodTypeSchema,
  status: z.enum([
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
  ]),
  fromDate: z.string(),
  toDate: z.string(),
  attendanceApprovedAt: isoDateTimeSchema.nullable(),
  attendanceApprovedByUserId: uuidSchema.nullable(),
  closedAt: isoDateTimeSchema.nullable(),
  closedByUserId: uuidSchema.nullable(),
  attendance: monthlyAttendanceSummarySchema,
  snapshot: periodAttendanceSnapshotViewSchema.nullable(),
  version: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type MonthlyPeriodView = z.infer<typeof monthlyPeriodViewSchema>;
