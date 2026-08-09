/**
 * Formas que devuelve la API.
 *
 * Se declaran acá y no se importan de `apps/api` porque la web no depende del
 * backend: el contrato compartido son los esquemas de `@casas/contracts` para lo
 * que se envía, y estas interfaces para lo que se recibe.
 */

export type PlatformRole =
  | 'FAMILY_EMPLOYER'
  | 'WORKER'
  | 'ACCOUNTANT'
  | 'ACCOUNTING_ASSISTANT'
  | 'PLATFORM_ADMIN'
  | 'SUPPORT'
  | 'SYSTEM';

export interface Me {
  userId: string;
  email: string | null;
  displayName: string;
  timezone: string;
  roles: PlatformRole[];
  employer: { id: string; firstName: string; lastName: string } | null;
  worker: { id: string; firstName: string; lastName: string } | null;
  pendingInvitations: number;
}

export interface Household {
  id: string;
  label: string;
  street: string;
  streetNumber: string;
  floor: string | null;
  apartment: string | null;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  timezone: string;
  accessInstructions: string | null;
  isActive: boolean;
}

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'REVOKED' | 'EXPIRED';

export interface Invitation {
  id: string;
  workerEmail: string;
  workerName: string | null;
  status: InvitationStatus;
  householdId: string;
  householdLabel: string;
  expiresAt: string;
  sentAt: string;
  resentCount: number;
  employmentRelationshipId: string | null;
}

export interface ResolvedInvitation {
  id: string;
  employerName: string;
  householdLabel: string;
  householdCity: string;
  workerEmail: string;
  expiresAt: string;
  status: InvitationStatus;
}

export type RelationshipStatus =
  | 'DRAFT'
  | 'PENDING_CONFIGURATION'
  | 'PENDING_WORKER_ACCEPTANCE'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'TERMINATION_IN_PROGRESS'
  | 'TERMINATED';

export interface Conditions {
  plannedStartDate: string;
  categoryCode: string;
  liveInMode: string;
  remunerationScheme: string;
  /** String decimal exacto. Nunca se convierte a number en la web (RN-13). */
  agreedRemuneration: string;
  currency: string;
  weeklyHours: number | null;
  paymentDayOfMonth: number | null;
  requiresProfessionalReview: boolean;
  adminNotes: string | null;
  acceptedByWorkerAt: string | null;
}

export interface ScheduleDay {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  breakMinutes: number;
}

export interface Schedule {
  status: string;
  effectiveFrom: string;
  days: ScheduleDay[];
  weeklyMinutes: number;
}

export interface Relationship {
  id: string;
  status: RelationshipStatus;
  household: { id: string; label: string; city: string; timezone: string };
  employer: { id: string; name: string };
  worker: { id: string; name: string } | null;
  conditions: Conditions | null;
  schedule: Schedule | null;
  nextAction: { actor: 'FAMILY_EMPLOYER' | 'WORKER' | 'NONE'; description: string };
  version: number;
}

export interface Profile {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  timezone: string;
}

export type AttendanceStatus = 'OPEN' | 'PENDING_APPROVAL' | 'APPROVED' | 'DISPUTED' | 'LOCKED';

export interface TimeEntryItem {
  id: string;
  kind: 'CLOCK_IN' | 'CLOCK_OUT' | 'BREAK_START' | 'BREAK_END';
  status: string;
  declaredAt: string;
  receivedAt: string;
  method: string;
  note: string | null;
  correctsTimeEntryId: string | null;
}

export interface AttendanceCorrectionItem {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
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

export interface AttendanceRecord {
  id: string;
  relationshipId: string;
  date: string;
  status: AttendanceStatus;
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
  entries: TimeEntryItem[];
  corrections: AttendanceCorrectionItem[];
  version: number;
  createdAt: string;
  updatedAt: string;
}
