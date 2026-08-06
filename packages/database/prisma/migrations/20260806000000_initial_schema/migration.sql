-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('FAMILY_EMPLOYER', 'WORKER', 'ACCOUNTANT', 'ACCOUNTANT_MANAGER', 'OPERATIONS_AGENT', 'PLATFORM_ADMIN', 'SUPPORT_AGENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ConsentKind" AS ENUM ('TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'GEOLOCATION_AT_CLOCK_IN', 'PROFESSIONAL_ENGAGEMENT', 'DATA_PROCESSING');

-- CreateEnum
CREATE TYPE "IdentityVerificationStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BankAccountKind" AS ENUM ('CBU', 'CVU');

-- CreateEnum
CREATE TYPE "ProfessionalLicenseStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ProfessionalAssignmentStatus" AS ENUM ('PROPOSED', 'ACTIVE', 'PAUSED', 'REVOKED');

-- CreateEnum
CREATE TYPE "EmploymentRelationshipStatus" AS ENUM ('DRAFT', 'PENDING_WORKER_ACCEPTANCE', 'PENDING_CONFIGURATION', 'ACTIVE', 'SUSPENDED', 'TERMINATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LiveInMode" AS ENUM ('WITH_WITHDRAWAL', 'WITHOUT_WITHDRAWAL');

-- CreateEnum
CREATE TYPE "RemunerationScheme" AS ENUM ('MONTHLY', 'HOURLY');

-- CreateEnum
CREATE TYPE "ClockInMethod" AS ENUM ('BUTTON', 'QR', 'PIN', 'PROXIMITY', 'MANUAL');

-- CreateEnum
CREATE TYPE "WorkScheduleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "TimeEntryStatus" AS ENUM ('PENDING_SYNC', 'RECORDED', 'PENDING_APPROVAL', 'APPROVED', 'DISPUTED', 'CORRECTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TimeEntryKind" AS ENUM ('CLOCK_IN', 'CLOCK_OUT', 'BREAK_START', 'BREAK_END');

-- CreateEnum
CREATE TYPE "WorkDayStatus" AS ENUM ('OPEN', 'PENDING_APPROVAL', 'APPROVED', 'DISPUTED', 'LOCKED');

-- CreateEnum
CREATE TYPE "AttendanceCorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EmploymentEventType" AS ENUM ('ABSENCE_UNJUSTIFIED', 'ABSENCE_JUSTIFIED', 'PAID_LEAVE', 'UNPAID_LEAVE', 'VACATION', 'ADVANCE', 'HOLIDAY', 'OTHER');

-- CreateEnum
CREATE TYPE "EmploymentEventStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ParameterVersionStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('OPEN', 'PENDING_ATTENDANCE_APPROVAL', 'READY_FOR_CALCULATION', 'CALCULATED', 'PENDING_PROFESSIONAL_REVIEW', 'OBSERVED', 'APPROVED', 'PENDING_ARCA', 'ARCA_DOCUMENT_IMPORTED', 'PENDING_PAYMENT', 'PAID', 'RECONCILED', 'RECTIFICATION_REQUIRED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('MONTHLY', 'EXTRAORDINARY', 'FINAL');

-- CreateEnum
CREATE TYPE "ConceptSign" AS ENUM ('CREDIT', 'DEBIT', 'INFORMATIONAL');

-- CreateEnum
CREATE TYPE "ProfessionalReviewOutcome" AS ENUM ('APPROVED', 'OBSERVED', 'INFORMATION_REQUESTED');

-- CreateEnum
CREATE TYPE "ARCATaskType" AS ENUM ('RELATIONSHIP_REGISTRATION', 'RECEIPT_ISSUANCE', 'CONTRIBUTION_PAYMENT', 'RECTIFICATION');

-- CreateEnum
CREATE TYPE "ARCATaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'OBSERVED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "ARCADocumentKind" AS ENUM ('OFFICIAL_RECEIPT', 'CONTRIBUTION_PROOF', 'ART_PROOF', 'REGISTRATION_PROOF', 'OTHER');

-- CreateEnum
CREATE TYPE "ARCAValidationStatus" AS ENUM ('PENDING', 'VALID', 'INVALID', 'UNREADABLE');

-- CreateEnum
CREATE TYPE "ARCADelegationStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'REGISTERED', 'CONFIRMED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('MANUAL_TRANSFER', 'PSP_INITIATED');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('OPEN', 'RESOLVED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ReceiptDifferenceClass" AS ENUM ('NONE', 'ROUNDING', 'CONCEPT_MISMATCH', 'AMOUNT_MISMATCH', 'PERIOD_MISMATCH', 'PARTY_MISMATCH', 'UNREADABLE');

-- CreateEnum
CREATE TYPE "DocumentScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('IDENTITY', 'AGREEMENT', 'OFFICIAL_RECEIPT', 'PAYMENT_PROOF', 'CONTRIBUTION_PROOF', 'ENGAGEMENT_LETTER', 'DELEGATION_EVIDENCE', 'LEAVE_SUPPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('PUSH', 'EMAIL', 'SMS', 'WHATSAPP', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'READ');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_USER', 'ESCALATED', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "phoneVerifiedAt" TIMESTAMP(3),
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecretCipher" TEXT,
    "mfaSecretKeyId" TEXT,
    "displayName" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'es-AR',
    "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_role" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "PlatformRole" NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedByUserId" UUID,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "user_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "tokenFamilyId" UUID NOT NULL,
    "deviceLabel" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "one_time_code" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "destination" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "one_time_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_document" (
    "id" UUID NOT NULL,
    "kind" "ConsentKind" NOT NULL,
    "version" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'es-AR',
    "body" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "consentDocumentId" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "deviceId" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employer" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "legalName" TEXT NOT NULL,
    "cuilCipher" TEXT,
    "cuilKeyId" TEXT,
    "cuilLast4" TEXT,
    "verificationStatus" "IdentityVerificationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "verifiedAt" TIMESTAMP(3),
    "verificationProvider" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "employer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "legalName" TEXT NOT NULL,
    "cuilCipher" TEXT,
    "cuilKeyId" TEXT,
    "cuilLast4" TEXT,
    "birthDate" DATE,
    "verificationStatus" "IdentityVerificationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "verifiedAt" TIMESTAMP(3),
    "verificationProvider" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_bank_account" (
    "id" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "kind" "BankAccountKind" NOT NULL,
    "numberCipher" TEXT NOT NULL,
    "numberKeyId" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "alias" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "confirmedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "worker_bank_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_firm" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "accounting_firm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountant" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accountingFirmId" UUID,
    "legalName" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "licenseStatus" "ProfessionalLicenseStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "licenseValidUntil" DATE,
    "licenseVerifiedAt" TIMESTAMP(3),
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "accountant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional_assignment" (
    "id" UUID NOT NULL,
    "accountantId" UUID NOT NULL,
    "employmentRelationshipId" UUID NOT NULL,
    "status" "ProfessionalAssignmentStatus" NOT NULL DEFAULT 'PROPOSED',
    "scope" TEXT NOT NULL,
    "engagementLetterDocumentId" UUID,
    "acceptedByEmployerAt" TIMESTAMP(3),
    "acceptedByAccountantAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "professional_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household" (
    "id" UUID NOT NULL,
    "employerId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    "unfavorableZoneCode" TEXT,
    "geoLat" DECIMAL(9,6),
    "geoLng" DECIMAL(9,6),
    "geoRadiusMeters" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employment_relationship" (
    "id" UUID NOT NULL,
    "employerId" UUID NOT NULL,
    "workerId" UUID,
    "householdId" UUID NOT NULL,
    "status" "EmploymentRelationshipStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" DATE NOT NULL,
    "terminationDate" DATE,
    "terminationReason" TEXT,
    "invitationTokenHash" TEXT,
    "invitationSentAt" TIMESTAMP(3),
    "invitationExpiresAt" TIMESTAMP(3),
    "workerAcceptedAt" TIMESTAMP(3),
    "workerAcceptanceEvidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "employment_relationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationship_terms" (
    "id" UUID NOT NULL,
    "employmentRelationshipId" UUID NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "categoryCode" TEXT NOT NULL,
    "liveInMode" "LiveInMode" NOT NULL,
    "remunerationScheme" "RemunerationScheme" NOT NULL,
    "agreedRemuneration" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "weeklyHours" INTEGER,
    "changeReason" TEXT,
    "acceptedByWorkerAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "relationship_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_schedule" (
    "id" UUID NOT NULL,
    "employmentRelationshipId" UUID NOT NULL,
    "status" "WorkScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "allowedMethods" "ClockInMethod"[],
    "defaultMethod" "ClockInMethod" NOT NULL DEFAULT 'BUTTON',
    "roundingMinutes" INTEGER NOT NULL DEFAULT 0,
    "toleranceMinutes" INTEGER NOT NULL DEFAULT 0,
    "pinHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "work_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_schedule_rule" (
    "id" UUID NOT NULL,
    "workScheduleId" UUID NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_schedule_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_schedule_exception" (
    "id" UUID NOT NULL,
    "workScheduleId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_schedule_exception_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entry" (
    "id" UUID NOT NULL,
    "employmentRelationshipId" UUID NOT NULL,
    "workDayId" UUID,
    "kind" "TimeEntryKind" NOT NULL,
    "status" "TimeEntryStatus" NOT NULL DEFAULT 'PENDING_SYNC',
    "declaredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timezone" TEXT NOT NULL,
    "method" "ClockInMethod" NOT NULL,
    "deviceId" TEXT,
    "deviceLabel" TEXT,
    "geoLat" DECIMAL(9,6),
    "geoLng" DECIMAL(9,6),
    "geoAccuracyMeters" INTEGER,
    "clientIdempotencyKey" TEXT NOT NULL,
    "evidence" JSONB,
    "note" TEXT,
    "correctsTimeEntryId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "time_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_day" (
    "id" UUID NOT NULL,
    "employmentRelationshipId" UUID NOT NULL,
    "payrollPeriodId" UUID,
    "date" DATE NOT NULL,
    "status" "WorkDayStatus" NOT NULL DEFAULT 'OPEN',
    "realMinutes" INTEGER NOT NULL DEFAULT 0,
    "computableMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "isHoliday" BOOLEAN NOT NULL DEFAULT false,
    "appliedRoundingRule" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "work_day_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_correction" (
    "id" UUID NOT NULL,
    "timeEntryId" UUID NOT NULL,
    "status" "AttendanceCorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "requestedByUserId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "proposedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" UUID,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "attendance_correction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employment_event" (
    "id" UUID NOT NULL,
    "employmentRelationshipId" UUID NOT NULL,
    "payrollPeriodId" UUID,
    "type" "EmploymentEventType" NOT NULL,
    "status" "EmploymentEventStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "days" INTEGER NOT NULL DEFAULT 0,
    "amount" DECIMAL(18,4),
    "reason" TEXT,
    "supportingDocumentId" UUID,
    "requestedByUserId" UUID NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "employment_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_parameter_version" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "status" "ParameterVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "source" TEXT NOT NULL,
    "isFixture" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "payload" JSONB NOT NULL,
    "preparedByUserId" UUID,
    "approvedByUserId" UUID,
    "publishedAt" TIMESTAMP(3),
    "supersedesVersionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payroll_parameter_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_category" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isFixture" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "worker_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_period" (
    "id" UUID NOT NULL,
    "employmentRelationshipId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "periodType" "PeriodType" NOT NULL DEFAULT 'MONTHLY',
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "currentVersionNumber" INTEGER NOT NULL DEFAULT 0,
    "attendanceApprovedAt" TIMESTAMP(3),
    "attendanceApprovedByUserId" UUID,
    "closedAt" TIMESTAMP(3),
    "closedByUserId" UUID,
    "settlementNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payroll_period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_version" (
    "id" UUID NOT NULL,
    "payrollPeriodId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "supersedesVersionId" UUID,
    "rectificationReason" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payroll_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_calculation" (
    "id" UUID NOT NULL,
    "payrollVersionId" UUID NOT NULL,
    "payrollParameterVersionId" UUID NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "grossEstimate" DECIMAL(18,4) NOT NULL,
    "deductionsEstimate" DECIMAL(18,4) NOT NULL,
    "netEstimate" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "usedFixtureParameters" BOOLEAN NOT NULL DEFAULT true,
    "warnings" JSONB NOT NULL,
    "blockingErrors" JSONB NOT NULL,
    "trace" JSONB NOT NULL,
    "estimatedObligations" JSONB NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calculatedByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payroll_calculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_line_item" (
    "id" UUID NOT NULL,
    "payrollCalculationId" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sign" "ConceptSign" NOT NULL,
    "calculationBase" DECIMAL(18,4) NOT NULL,
    "quantity" DECIMAL(18,4),
    "rate" TEXT,
    "amount" DECIMAL(18,4) NOT NULL,
    "formulaId" TEXT NOT NULL,
    "formulaExplanation" TEXT NOT NULL,
    "parameterRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_line_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional_review" (
    "id" UUID NOT NULL,
    "payrollVersionId" UUID NOT NULL,
    "professionalAssignmentId" UUID NOT NULL,
    "outcome" "ProfessionalReviewOutcome" NOT NULL,
    "licenseNumberSnapshot" TEXT NOT NULL,
    "jurisdictionSnapshot" TEXT NOT NULL,
    "observations" JSONB NOT NULL,
    "privateNotes" TEXT,
    "sharedNotes" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "professional_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arca_task" (
    "id" UUID NOT NULL,
    "employmentRelationshipId" UUID NOT NULL,
    "payrollPeriodId" UUID,
    "type" "ARCATaskType" NOT NULL,
    "status" "ARCATaskStatus" NOT NULL DEFAULT 'PENDING',
    "assigneeRole" "PlatformRole" NOT NULL,
    "assigneeUserId" UUID,
    "dueDate" DATE NOT NULL,
    "preparedValues" JSONB NOT NULL,
    "officialLinkKey" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedByUserId" UUID,
    "observationNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "arca_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arca_checklist_item" (
    "id" UUID NOT NULL,
    "arcaTaskId" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "helpText" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arca_checklist_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arca_document" (
    "id" UUID NOT NULL,
    "employmentRelationshipId" UUID NOT NULL,
    "payrollPeriodId" UUID,
    "payrollVersionId" UUID,
    "documentId" UUID NOT NULL,
    "kind" "ARCADocumentKind" NOT NULL,
    "sha256" TEXT NOT NULL,
    "extractedMetadata" JSONB,
    "qrPayload" TEXT,
    "qrVerifiedAt" TIMESTAMP(3),
    "validationStatus" "ARCAValidationStatus" NOT NULL DEFAULT 'PENDING',
    "validationDetails" JSONB,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "arca_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arca_delegation" (
    "id" UUID NOT NULL,
    "employmentRelationshipId" UUID NOT NULL,
    "accountantId" UUID NOT NULL,
    "serviceName" TEXT NOT NULL,
    "representedCuilLast4" TEXT NOT NULL,
    "authorizedCuilLast4" TEXT NOT NULL,
    "status" "ARCADelegationStatus" NOT NULL DEFAULT 'PENDING',
    "grantedAt" TIMESTAMP(3),
    "validUntil" DATE,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "evidenceDocumentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "arca_delegation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" UUID NOT NULL,
    "employmentRelationshipId" UUID NOT NULL,
    "payrollPeriodId" UUID NOT NULL,
    "payrollVersionId" UUID NOT NULL,
    "workerBankAccountId" UUID NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "method" "PaymentMethod" NOT NULL DEFAULT 'MANUAL_TRANSFER',
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "paidAt" TIMESTAMP(3),
    "externalReference" TEXT,
    "proofDocumentId" UUID,
    "idempotencyKey" TEXT NOT NULL,
    "registeredByUserId" UUID NOT NULL,
    "confirmedByWorkerAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation" (
    "id" UUID NOT NULL,
    "payrollPeriodId" UUID NOT NULL,
    "payrollVersionId" UUID NOT NULL,
    "paymentId" UUID,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'OPEN',
    "hasBlockingDifferences" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" UUID,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_comparison" (
    "id" UUID NOT NULL,
    "reconciliationId" UUID NOT NULL,
    "arcaDocumentId" UUID NOT NULL,
    "differences" JSONB NOT NULL,
    "blocking" BOOLEAN NOT NULL DEFAULT false,
    "comparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "receipt_comparison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document" (
    "id" UUID NOT NULL,
    "employmentRelationshipId" UUID,
    "ownerUserId" UUID NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "detectedContentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "scanStatus" "DocumentScanStatus" NOT NULL DEFAULT 'PENDING',
    "scanDetails" TEXT,
    "retentionPolicy" TEXT NOT NULL DEFAULT 'PENDING_LEGAL_DEFINITION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_access_log" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "correlationId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_access_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_template" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'es-AR',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "payload" JSONB NOT NULL,
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "includesProfessionalReview" BOOLEAN NOT NULL DEFAULT false,
    "maxRelationships" INTEGER,
    "monthlyPrice" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription" (
    "id" UUID NOT NULL,
    "employerId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "priceSnapshot" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_ticket" (
    "id" UUID NOT NULL,
    "reporterUserId" UUID NOT NULL,
    "assigneeUserId" UUID,
    "employmentRelationshipId" UUID,
    "category" TEXT NOT NULL,
    "priority" "SupportTicketPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isRestricted" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "support_ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" UUID NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" UUID,
    "actorRole" "PlatformRole" NOT NULL,
    "onBehalfOfUserId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "correlationId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "deviceId" TEXT,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_message" (
    "id" UUID NOT NULL,
    "topic" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "correlationId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_record" (
    "id" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "managed_content" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'URL',
    "ownerUserId" UUID,
    "source" TEXT,
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "managed_content_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_phone_key" ON "user"("phone");

-- CreateIndex
CREATE INDEX "user_status_idx" ON "user"("status");

-- CreateIndex
CREATE INDEX "user_role_role_idx" ON "user_role"("role");

-- CreateIndex
CREATE UNIQUE INDEX "user_role_userId_role_key" ON "user_role"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "session_refreshTokenHash_key" ON "session"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "session_userId_revokedAt_idx" ON "session"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "session_tokenFamilyId_idx" ON "session"("tokenFamilyId");

-- CreateIndex
CREATE INDEX "one_time_code_destination_purpose_idx" ON "one_time_code"("destination", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "consent_document_kind_version_locale_key" ON "consent_document"("kind", "version", "locale");

-- CreateIndex
CREATE INDEX "consent_userId_purpose_idx" ON "consent"("userId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "employer_userId_key" ON "employer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "worker_userId_key" ON "worker"("userId");

-- CreateIndex
CREATE INDEX "worker_bank_account_workerId_archivedAt_idx" ON "worker_bank_account"("workerId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "accountant_userId_key" ON "accountant"("userId");

-- CreateIndex
CREATE INDEX "accountant_licenseStatus_idx" ON "accountant"("licenseStatus");

-- CreateIndex
CREATE UNIQUE INDEX "accountant_licenseNumber_jurisdiction_key" ON "accountant"("licenseNumber", "jurisdiction");

-- CreateIndex
CREATE INDEX "professional_assignment_status_idx" ON "professional_assignment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "professional_assignment_accountantId_employmentRelationship_key" ON "professional_assignment"("accountantId", "employmentRelationshipId");

-- CreateIndex
CREATE INDEX "household_employerId_archivedAt_idx" ON "household"("employerId", "archivedAt");

-- CreateIndex
CREATE INDEX "employment_relationship_employerId_status_idx" ON "employment_relationship"("employerId", "status");

-- CreateIndex
CREATE INDEX "employment_relationship_workerId_status_idx" ON "employment_relationship"("workerId", "status");

-- CreateIndex
CREATE INDEX "relationship_terms_employmentRelationshipId_effectiveTo_idx" ON "relationship_terms"("employmentRelationshipId", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "relationship_terms_employmentRelationshipId_effectiveFrom_key" ON "relationship_terms"("employmentRelationshipId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "work_schedule_employmentRelationshipId_status_idx" ON "work_schedule"("employmentRelationshipId", "status");

-- CreateIndex
CREATE INDEX "work_schedule_rule_workScheduleId_dayOfWeek_idx" ON "work_schedule_rule"("workScheduleId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "work_schedule_exception_workScheduleId_date_key" ON "work_schedule_exception"("workScheduleId", "date");

-- CreateIndex
CREATE INDEX "time_entry_employmentRelationshipId_declaredAt_idx" ON "time_entry"("employmentRelationshipId", "declaredAt");

-- CreateIndex
CREATE INDEX "time_entry_status_idx" ON "time_entry"("status");

-- CreateIndex
CREATE UNIQUE INDEX "time_entry_employmentRelationshipId_clientIdempotencyKey_key" ON "time_entry"("employmentRelationshipId", "clientIdempotencyKey");

-- CreateIndex
CREATE INDEX "work_day_payrollPeriodId_status_idx" ON "work_day"("payrollPeriodId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "work_day_employmentRelationshipId_date_key" ON "work_day"("employmentRelationshipId", "date");

-- CreateIndex
CREATE INDEX "attendance_correction_status_idx" ON "attendance_correction"("status");

-- CreateIndex
CREATE INDEX "employment_event_employmentRelationshipId_fromDate_idx" ON "employment_event"("employmentRelationshipId", "fromDate");

-- CreateIndex
CREATE INDEX "employment_event_payrollPeriodId_status_idx" ON "employment_event"("payrollPeriodId", "status");

-- CreateIndex
CREATE INDEX "payroll_parameter_version_status_effectiveFrom_idx" ON "payroll_parameter_version"("status", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "worker_category_code_key" ON "worker_category"("code");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_period_settlementNumber_key" ON "payroll_period"("settlementNumber");

-- CreateIndex
CREATE INDEX "payroll_period_status_idx" ON "payroll_period"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_period_employmentRelationshipId_year_month_periodTy_key" ON "payroll_period"("employmentRelationshipId", "year", "month", "periodType");

-- CreateIndex
CREATE INDEX "payroll_version_payrollPeriodId_isCurrent_idx" ON "payroll_version"("payrollPeriodId", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_version_payrollPeriodId_versionNumber_key" ON "payroll_version"("payrollPeriodId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_calculation_payrollVersionId_key" ON "payroll_calculation"("payrollVersionId");

-- CreateIndex
CREATE INDEX "payroll_calculation_payrollParameterVersionId_idx" ON "payroll_calculation"("payrollParameterVersionId");

-- CreateIndex
CREATE INDEX "payroll_line_item_code_idx" ON "payroll_line_item"("code");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_line_item_payrollCalculationId_ordinal_key" ON "payroll_line_item"("payrollCalculationId", "ordinal");

-- CreateIndex
CREATE INDEX "professional_review_payrollVersionId_idx" ON "professional_review"("payrollVersionId");

-- CreateIndex
CREATE INDEX "arca_task_status_dueDate_idx" ON "arca_task"("status", "dueDate");

-- CreateIndex
CREATE INDEX "arca_task_assigneeUserId_status_idx" ON "arca_task"("assigneeUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "arca_checklist_item_arcaTaskId_ordinal_key" ON "arca_checklist_item"("arcaTaskId", "ordinal");

-- CreateIndex
CREATE INDEX "arca_document_payrollPeriodId_kind_idx" ON "arca_document"("payrollPeriodId", "kind");

-- CreateIndex
CREATE INDEX "arca_delegation_status_idx" ON "arca_delegation"("status");

-- CreateIndex
CREATE INDEX "payment_payrollPeriodId_status_idx" ON "payment"("payrollPeriodId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_employmentRelationshipId_idempotencyKey_key" ON "payment"("employmentRelationshipId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "reconciliation_payrollPeriodId_status_idx" ON "reconciliation"("payrollPeriodId", "status");

-- CreateIndex
CREATE INDEX "receipt_comparison_reconciliationId_idx" ON "receipt_comparison"("reconciliationId");

-- CreateIndex
CREATE UNIQUE INDEX "document_objectKey_key" ON "document"("objectKey");

-- CreateIndex
CREATE INDEX "document_employmentRelationshipId_kind_idx" ON "document"("employmentRelationshipId", "kind");

-- CreateIndex
CREATE INDEX "document_scanStatus_idx" ON "document"("scanStatus");

-- CreateIndex
CREATE INDEX "document_access_log_documentId_occurredAt_idx" ON "document_access_log"("documentId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_template_code_version_channel_locale_key" ON "notification_template"("code", "version", "channel", "locale");

-- CreateIndex
CREATE INDEX "notification_status_scheduledFor_idx" ON "notification"("status", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "notification_userId_dedupeKey_key" ON "notification"("userId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "plan_code_key" ON "plan"("code");

-- CreateIndex
CREATE INDEX "subscription_employerId_status_idx" ON "subscription"("employerId", "status");

-- CreateIndex
CREATE INDEX "support_ticket_status_priority_idx" ON "support_ticket"("status", "priority");

-- CreateIndex
CREATE INDEX "audit_event_entityType_entityId_occurredAt_idx" ON "audit_event"("entityType", "entityId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_event_actorUserId_occurredAt_idx" ON "audit_event"("actorUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_event_action_occurredAt_idx" ON "audit_event"("action", "occurredAt");

-- CreateIndex
CREATE INDEX "outbox_message_processedAt_availableAt_idx" ON "outbox_message"("processedAt", "availableAt");

-- CreateIndex
CREATE INDEX "idempotency_record_expiresAt_idx" ON "idempotency_record"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_record_scope_idempotencyKey_key" ON "idempotency_record"("scope", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "managed_content_key_key" ON "managed_content"("key");

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent" ADD CONSTRAINT "consent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent" ADD CONSTRAINT "consent_consentDocumentId_fkey" FOREIGN KEY ("consentDocumentId") REFERENCES "consent_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employer" ADD CONSTRAINT "employer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker" ADD CONSTRAINT "worker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_bank_account" ADD CONSTRAINT "worker_bank_account_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant" ADD CONSTRAINT "accountant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant" ADD CONSTRAINT "accountant_accountingFirmId_fkey" FOREIGN KEY ("accountingFirmId") REFERENCES "accounting_firm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_assignment" ADD CONSTRAINT "professional_assignment_accountantId_fkey" FOREIGN KEY ("accountantId") REFERENCES "accountant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_assignment" ADD CONSTRAINT "professional_assignment_employmentRelationshipId_fkey" FOREIGN KEY ("employmentRelationshipId") REFERENCES "employment_relationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household" ADD CONSTRAINT "household_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "employer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_relationship" ADD CONSTRAINT "employment_relationship_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "employer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_relationship" ADD CONSTRAINT "employment_relationship_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_relationship" ADD CONSTRAINT "employment_relationship_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationship_terms" ADD CONSTRAINT "relationship_terms_employmentRelationshipId_fkey" FOREIGN KEY ("employmentRelationshipId") REFERENCES "employment_relationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_schedule" ADD CONSTRAINT "work_schedule_employmentRelationshipId_fkey" FOREIGN KEY ("employmentRelationshipId") REFERENCES "employment_relationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_schedule_rule" ADD CONSTRAINT "work_schedule_rule_workScheduleId_fkey" FOREIGN KEY ("workScheduleId") REFERENCES "work_schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_schedule_exception" ADD CONSTRAINT "work_schedule_exception_workScheduleId_fkey" FOREIGN KEY ("workScheduleId") REFERENCES "work_schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_employmentRelationshipId_fkey" FOREIGN KEY ("employmentRelationshipId") REFERENCES "employment_relationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_workDayId_fkey" FOREIGN KEY ("workDayId") REFERENCES "work_day"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_correctsTimeEntryId_fkey" FOREIGN KEY ("correctsTimeEntryId") REFERENCES "time_entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_day" ADD CONSTRAINT "work_day_employmentRelationshipId_fkey" FOREIGN KEY ("employmentRelationshipId") REFERENCES "employment_relationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_day" ADD CONSTRAINT "work_day_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "payroll_period"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_correction" ADD CONSTRAINT "attendance_correction_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "time_entry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_event" ADD CONSTRAINT "employment_event_employmentRelationshipId_fkey" FOREIGN KEY ("employmentRelationshipId") REFERENCES "employment_relationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_event" ADD CONSTRAINT "employment_event_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "payroll_period"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_period" ADD CONSTRAINT "payroll_period_employmentRelationshipId_fkey" FOREIGN KEY ("employmentRelationshipId") REFERENCES "employment_relationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_version" ADD CONSTRAINT "payroll_version_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "payroll_period"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_version" ADD CONSTRAINT "payroll_version_supersedesVersionId_fkey" FOREIGN KEY ("supersedesVersionId") REFERENCES "payroll_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_calculation" ADD CONSTRAINT "payroll_calculation_payrollVersionId_fkey" FOREIGN KEY ("payrollVersionId") REFERENCES "payroll_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_calculation" ADD CONSTRAINT "payroll_calculation_payrollParameterVersionId_fkey" FOREIGN KEY ("payrollParameterVersionId") REFERENCES "payroll_parameter_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_line_item" ADD CONSTRAINT "payroll_line_item_payrollCalculationId_fkey" FOREIGN KEY ("payrollCalculationId") REFERENCES "payroll_calculation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_review" ADD CONSTRAINT "professional_review_payrollVersionId_fkey" FOREIGN KEY ("payrollVersionId") REFERENCES "payroll_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_review" ADD CONSTRAINT "professional_review_professionalAssignmentId_fkey" FOREIGN KEY ("professionalAssignmentId") REFERENCES "professional_assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arca_task" ADD CONSTRAINT "arca_task_employmentRelationshipId_fkey" FOREIGN KEY ("employmentRelationshipId") REFERENCES "employment_relationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arca_task" ADD CONSTRAINT "arca_task_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "payroll_period"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arca_checklist_item" ADD CONSTRAINT "arca_checklist_item_arcaTaskId_fkey" FOREIGN KEY ("arcaTaskId") REFERENCES "arca_task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arca_document" ADD CONSTRAINT "arca_document_employmentRelationshipId_fkey" FOREIGN KEY ("employmentRelationshipId") REFERENCES "employment_relationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arca_document" ADD CONSTRAINT "arca_document_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "payroll_period"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arca_document" ADD CONSTRAINT "arca_document_payrollVersionId_fkey" FOREIGN KEY ("payrollVersionId") REFERENCES "payroll_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arca_document" ADD CONSTRAINT "arca_document_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arca_delegation" ADD CONSTRAINT "arca_delegation_employmentRelationshipId_fkey" FOREIGN KEY ("employmentRelationshipId") REFERENCES "employment_relationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arca_delegation" ADD CONSTRAINT "arca_delegation_accountantId_fkey" FOREIGN KEY ("accountantId") REFERENCES "accountant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_employmentRelationshipId_fkey" FOREIGN KEY ("employmentRelationshipId") REFERENCES "employment_relationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "payroll_period"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_payrollVersionId_fkey" FOREIGN KEY ("payrollVersionId") REFERENCES "payroll_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_workerBankAccountId_fkey" FOREIGN KEY ("workerBankAccountId") REFERENCES "worker_bank_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation" ADD CONSTRAINT "reconciliation_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "payroll_period"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation" ADD CONSTRAINT "reconciliation_payrollVersionId_fkey" FOREIGN KEY ("payrollVersionId") REFERENCES "payroll_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation" ADD CONSTRAINT "reconciliation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_comparison" ADD CONSTRAINT "receipt_comparison_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "reconciliation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_comparison" ADD CONSTRAINT "receipt_comparison_arcaDocumentId_fkey" FOREIGN KEY ("arcaDocumentId") REFERENCES "arca_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_employmentRelationshipId_fkey" FOREIGN KEY ("employmentRelationshipId") REFERENCES "employment_relationship"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_access_log" ADD CONSTRAINT "document_access_log_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "notification_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "employer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

