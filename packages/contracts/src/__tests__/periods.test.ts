import { describe, expect, it } from 'vitest';
import {
  closeAttendancePeriodRequestSchema,
  createMonthlyPeriodRequestSchema,
  monthlyPeriodViewSchema,
} from '../periods';

describe('Contracts — Monthly Attendance Periods', () => {
  it('valida createMonthlyPeriodRequestSchema con año y mes válidos', () => {
    const valid = createMonthlyPeriodRequestSchema.safeParse({ year: 2026, month: 8 });
    expect(valid.success).toBe(true);

    const invalidMonth = createMonthlyPeriodRequestSchema.safeParse({ year: 2026, month: 13 });
    expect(invalidMonth.success).toBe(false);

    const invalidYear = createMonthlyPeriodRequestSchema.safeParse({ year: 2019, month: 8 });
    expect(invalidYear.success).toBe(false);
  });

  it('valida closeAttendancePeriodRequestSchema con expectedVersion', () => {
    const valid = closeAttendancePeriodRequestSchema.safeParse({ expectedVersion: 3 });
    expect(valid.success).toBe(true);

    const invalid = closeAttendancePeriodRequestSchema.safeParse({ expectedVersion: -1 });
    expect(invalid.success).toBe(false);
  });

  it('valida monthlyPeriodViewSchema completo', () => {
    const parsed = monthlyPeriodViewSchema.safeParse({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      relationshipId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      year: 2026,
      month: 8,
      periodType: 'MONTHLY',
      status: 'OPEN',
      fromDate: '2026-08-01',
      toDate: '2026-08-31',
      attendanceApprovedAt: null,
      attendanceApprovedByUserId: null,
      closedAt: null,
      closedByUserId: null,
      attendance: {
        approvedDays: 20,
        approvedMinutes: 9600,
        openDays: 0,
        pendingApprovalDays: 0,
        disputedDays: 0,
        totalAttendanceDays: 20,
      },
      snapshot: null,
      version: 0,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    });

    expect(parsed.success).toBe(true);
  });
});
