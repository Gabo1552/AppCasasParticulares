/**
 * Puerto de integración con ARCA.
 *
 * Toda la aplicación depende de esta interfaz y de ninguna implementación concreta.
 * Hoy sólo `ManualAssistedARCAConnector` está activo; `OfficialARCAConnector` existe
 * detrás de un feature flag y lanza `ARCAIntegrationNotEnabledError`
 * (docs/arca-integration-strategy.md).
 *
 * Restricciones que el diseño de estos tipos hace explícitas:
 *  - Ninguna operación recibe ni devuelve una clave fiscal (principio 5, SEG-06).
 *  - `createReceipt` **no emite** un recibo. El recibo se emite en ARCA. Acá se
 *    *prepara* la emisión, y por eso devuelve una tarea con checklist y valores a
 *    informar, no un documento (principio 7, ARC-04, decisión OD-17).
 *  - `downloadReceipt` devuelve un documento **previamente importado** por el usuario.
 *    No descarga nada de ARCA.
 */

import type { LocalDate } from '../value-objects/date-range';

// ─── Tipos comunes ───────────────────────────────────────────────────────────

export interface PeriodRef {
  readonly year: number;
  /** 1-12. */
  readonly month: number;
  readonly periodType: 'MONTHLY' | 'EXTRAORDINARY' | 'FINAL';
}

export const ARCATaskType = {
  RELATIONSHIP_REGISTRATION: 'RELATIONSHIP_REGISTRATION',
  RECEIPT_ISSUANCE: 'RECEIPT_ISSUANCE',
  CONTRIBUTION_PAYMENT: 'CONTRIBUTION_PAYMENT',
  RECTIFICATION: 'RECTIFICATION',
} as const;
export type ARCATaskType = (typeof ARCATaskType)[keyof typeof ARCATaskType];

export const ARCATaskStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  OBSERVED: 'OBSERVED',
  OVERDUE: 'OVERDUE',
} as const;
export type ARCATaskStatus = (typeof ARCATaskStatus)[keyof typeof ARCATaskStatus];

export interface ARCAChecklistItem {
  readonly order: number;
  readonly label: string;
  readonly helpText: string;
  readonly completed: boolean;
}

/**
 * Un valor que la familia debe transcribir en el formulario oficial.
 * `value` viaja como string: si es monetario, es un decimal exacto (nunca `number`).
 */
export interface PreparedValue {
  readonly fieldKey: string;
  /** Etiqueta tal como aparece en el formulario oficial, para que sea reconocible. */
  readonly officialLabel: string;
  readonly value: string;
  readonly kind: 'MONEY' | 'TEXT' | 'NUMBER' | 'DATE';
  readonly note?: string;
}

// ─── getRelationshipStatus ───────────────────────────────────────────────────

export interface GetRelationshipStatusInput {
  readonly employmentRelationshipId: string;
}

export interface RelationshipStatusResult {
  readonly employmentRelationshipId: string;
  /**
   * En el conector asistido, el estado es **declarado por la familia**, no consultado
   * a ARCA. El campo `sourceOfTruth` lo deja explícito para que nadie lo confunda con
   * un dato verificado en el organismo.
   */
  readonly sourceOfTruth: 'USER_DECLARED' | 'ARCA_VERIFIED';
  readonly registered: boolean;
  readonly declaredAt: string | null;
  readonly registrationChecklist: readonly ARCAChecklistItem[];
  readonly officialLinkUrl: string;
}

// ─── getObligations ──────────────────────────────────────────────────────────

export interface GetObligationsInput {
  readonly employmentRelationshipId: string;
  readonly period: PeriodRef;
}

export interface ObligationItem {
  readonly code: string;
  readonly label: string;
  /** Decimal exacto como string. */
  readonly estimatedAmount: string;
  readonly dueDate: LocalDate;
  readonly status: ARCATaskStatus;
  /** Estimado por la plataforma; el importe exigible lo determina ARCA. */
  readonly isEstimate: true;
}

export interface ObligationsResult {
  readonly employmentRelationshipId: string;
  readonly period: PeriodRef;
  readonly obligations: readonly ObligationItem[];
  readonly sourceOfTruth: 'PLATFORM_ESTIMATE' | 'ARCA_VERIFIED';
}

// ─── createReceipt ───────────────────────────────────────────────────────────

export interface CreateReceiptInput {
  readonly payrollPeriodId: string;
  readonly payrollVersionId: string;
}

/**
 * Resultado de *preparar* la emisión. No contiene un documento porque en el flujo
 * asistido el documento todavía no existe: lo va a generar ARCA cuando la familia
 * complete el formulario oficial con estos valores.
 */
export interface CreateReceiptResult {
  readonly arcaTaskId: string;
  readonly taskType: typeof ARCATaskType.RECEIPT_ISSUANCE;
  readonly status: ARCATaskStatus;
  readonly checklist: readonly ARCAChecklistItem[];
  readonly preparedValues: readonly PreparedValue[];
  readonly officialLinkUrl: string;
  readonly dueDate: LocalDate;
  /** Siempre `false` en el conector asistido: la plataforma nunca emite el recibo. */
  readonly receiptIssuedByPlatform: false;
}

// ─── downloadReceipt ─────────────────────────────────────────────────────────

export interface DownloadReceiptInput {
  readonly arcaDocumentId: string;
  readonly requestedByUserId: string;
}

export interface DownloadReceiptResult {
  readonly arcaDocumentId: string;
  /** URL firmada de vida corta hacia el object storage privado (DOC-01). */
  readonly signedUrl: string;
  readonly expiresAt: string;
  readonly sha256: string;
  readonly contentType: string;
}

// ─── validateReceipt ─────────────────────────────────────────────────────────

export interface ValidateReceiptInput {
  readonly arcaDocumentId: string;
  readonly payrollVersionId: string;
}

export const ReceiptDifferenceClass = {
  NONE: 'NONE',
  ROUNDING: 'ROUNDING',
  CONCEPT_MISMATCH: 'CONCEPT_MISMATCH',
  AMOUNT_MISMATCH: 'AMOUNT_MISMATCH',
  PERIOD_MISMATCH: 'PERIOD_MISMATCH',
  PARTY_MISMATCH: 'PARTY_MISMATCH',
  UNREADABLE: 'UNREADABLE',
} as const;
export type ReceiptDifferenceClass =
  (typeof ReceiptDifferenceClass)[keyof typeof ReceiptDifferenceClass];

export interface ReceiptDifference {
  readonly differenceClass: ReceiptDifferenceClass;
  readonly conceptCode: string | null;
  readonly expected: string | null;
  readonly found: string | null;
  readonly delta: string | null;
  readonly blocking: boolean;
  readonly message: string;
}

export interface ValidateReceiptResult {
  readonly arcaDocumentId: string;
  readonly payrollVersionId: string;
  readonly formatValid: boolean;
  readonly qrVerified: boolean | null;
  readonly differences: readonly ReceiptDifference[];
  readonly blocking: boolean;
  readonly validatedAt: string;
}

// ─── El puerto ───────────────────────────────────────────────────────────────

export interface ARCAConnector {
  readonly kind: 'MANUAL_ASSISTED' | 'OFFICIAL';

  getRelationshipStatus(input: GetRelationshipStatusInput): Promise<RelationshipStatusResult>;
  getObligations(input: GetObligationsInput): Promise<ObligationsResult>;
  /** Prepara la emisión en ARCA. No emite el recibo. */
  createReceipt(input: CreateReceiptInput): Promise<CreateReceiptResult>;
  /** Devuelve un documento ya importado por el usuario. No descarga de ARCA. */
  downloadReceipt(input: DownloadReceiptInput): Promise<DownloadReceiptResult>;
  validateReceipt(input: ValidateReceiptInput): Promise<ValidateReceiptResult>;
}

/** Token de inyección, para no acoplar el contenedor de DI a una clase concreta. */
export const ARCA_CONNECTOR = Symbol.for('casas.ports.ARCAConnector');
