/**
 * @casas/domain — tipos, objetos de valor, máquinas de estado y puertos del dominio.
 *
 * Paquete **puro**: sin HTTP, sin base de datos, sin framework. La regla la hace
 * cumplir ESLint (`pureDomain` en @casas/config) y se verifica en CI
 * (ADR 0001, decisión D3).
 */

// Errores
export {
  DomainError,
  InvalidValueError,
  IllegalStateTransitionError,
  TransitionGuardError,
  ARCAIntegrationNotEnabledError,
  ObjectPermissionDeniedError,
} from './errors';

// Roles
export {
  PlatformRole,
  MFA_REQUIRED_ROLES,
  INTERNAL_ROLES,
  requiresMfa,
  isInternalRole,
} from './roles';

// Objetos de valor
export { Money, RoundingMode, MONEY_SCALE, type Currency } from './value-objects/money';
export { Minutes } from './value-objects/minutes';
export { DateRange, assertLocalDate, type LocalDate } from './value-objects/date-range';
export {
  MaskedAccount,
  isValidCbuFormat,
  type BankAccountKind,
} from './value-objects/masked-account';

// Máquinas de estado
export {
  StateMachine,
  type TransitionContext,
  type TransitionDefinition,
} from './state-machines/state-machine';
export {
  EmploymentRelationshipStatus,
  employmentRelationshipStateMachine,
  type RelationshipTransitionPayload,
} from './state-machines/employment-relationship';
export {
  PayrollPeriodStatus,
  payrollPeriodStateMachine,
  type PayrollPeriodTransitionPayload,
} from './state-machines/payroll-period';
export {
  TimeEntryStatus,
  TimeEntryMethod,
  TimeEntryKind,
  timeEntryStateMachine,
  type TimeEntryTransitionPayload,
} from './state-machines/time-entry';

// Puertos
export {
  ARCA_CONNECTOR,
  ARCATaskType,
  ARCATaskStatus,
  ReceiptDifferenceClass,
  type ARCAConnector,
  type ARCAChecklistItem,
  type PreparedValue,
  type PeriodRef,
  type GetRelationshipStatusInput,
  type RelationshipStatusResult,
  type GetObligationsInput,
  type ObligationItem,
  type ObligationsResult,
  type CreateReceiptInput,
  type CreateReceiptResult,
  type DownloadReceiptInput,
  type DownloadReceiptResult,
  type ValidateReceiptInput,
  type ValidateReceiptResult,
  type ReceiptDifference,
} from './ports/arca-connector';
export {
  PAYMENT_PROVIDER,
  PaymentStatus,
  PaymentMethod,
  type PaymentProvider,
  type WorkerPayoutTarget,
  type CreatePaymentIntentInput,
  type PaymentIntentResult,
  type GetPaymentStatusInput,
  type PaymentStatusResult,
  type CancelPaymentInput,
  type CancelPaymentResult,
} from './ports/payment-provider';
export {
  OBJECT_STORAGE,
  ANTIVIRUS_SCANNER,
  DocumentScanStatus,
  type ObjectStorage,
  type AntivirusScanner,
  type SignedUploadInput,
  type SignedUploadResult,
  type SignedDownloadInput,
  type SignedDownloadResult,
  type ObjectMetadata,
} from './ports/object-storage';
