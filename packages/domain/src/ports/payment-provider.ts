/**
 * Puerto de pagos.
 *
 * El diseño de estos tipos hace cumplir los principios 3 y 4 del encargo y PAG-02:
 * **el dinero nunca pasa por una cuenta de la plataforma**. No hay ningún campo que
 * represente un saldo, una cuenta de plataforma ni un destino intermedio. El único
 * destino posible es la cuenta de la trabajadora.
 *
 * En el MVP la única implementación es `ManualTransferProvider`: la familia transfiere
 * por su homebanking y registra el comprobante. Es un camino completo, no un stub
 * (PAG-10). Cuando exista un PSP habilitado por el BCRA (OD-05), se agrega otra
 * implementación de este mismo puerto sin tocar el dominio.
 */

import type { BankAccountKind } from '../value-objects/masked-account';

export const PaymentStatus = {
  PENDING: 'PENDING',
  REGISTERED: 'REGISTERED',
  CONFIRMED: 'CONFIRMED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PaymentMethod = {
  /** Transferencia hecha fuera de la app y registrada con comprobante (PAG-10). */
  MANUAL_TRANSFER: 'MANUAL_TRANSFER',
  /** Reservado: iniciación de pago mediante PSP o banco habilitado (OD-05). */
  PSP_INITIATED: 'PSP_INITIATED',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

/**
 * Destino del pago. Sólo admite la cuenta de la trabajadora, identificada por su id.
 * No existe una variante "cuenta de la plataforma": el tipo lo vuelve inexpresable.
 */
export interface WorkerPayoutTarget {
  readonly kind: 'WORKER_BANK_ACCOUNT';
  readonly workerId: string;
  readonly workerBankAccountId: string;
  readonly accountKind: BankAccountKind;
  /** Sólo los últimos 4 dígitos: el número completo nunca sale del cifrado. */
  readonly last4: string;
}

export interface CreatePaymentIntentInput {
  readonly payrollPeriodId: string;
  readonly payrollVersionId: string;
  readonly employmentRelationshipId: string;
  /** Decimal exacto como string. Nunca `number` (RN-13). */
  readonly amount: string;
  readonly currency: 'ARS';
  readonly target: WorkerPayoutTarget;
  readonly method: PaymentMethod;
  /** Clave de idempotencia provista por el cliente (PAG-07). */
  readonly idempotencyKey: string;
  readonly initiatedByUserId: string;
}

export interface PaymentIntentResult {
  readonly paymentId: string;
  readonly status: PaymentStatus;
  readonly method: PaymentMethod;
  readonly amount: string;
  readonly currency: 'ARS';
  /** Referencia externa (número de transacción) cuando existe. */
  readonly externalReference: string | null;
  /**
   * Instrucciones para completar el pago fuera de la app. En el proveedor manual son
   * los datos que la familia usa en su homebanking.
   */
  readonly instructions: readonly string[];
  readonly createdAt: string;
  /** Invariante del modelo: el dinero no toca la plataforma (INV-PAGO-01). */
  readonly fundsHeldByPlatform: false;
}

export interface GetPaymentStatusInput {
  readonly paymentId: string;
}

export interface PaymentStatusResult {
  readonly paymentId: string;
  readonly status: PaymentStatus;
  readonly amount: string;
  readonly currency: 'ARS';
  readonly externalReference: string | null;
  readonly proofDocumentId: string | null;
  readonly registeredAt: string | null;
  readonly confirmedAt: string | null;
}

export interface CancelPaymentInput {
  readonly paymentId: string;
  readonly reason: string;
  readonly cancelledByUserId: string;
}

export interface CancelPaymentResult {
  readonly paymentId: string;
  readonly status: typeof PaymentStatus.CANCELLED;
  readonly cancelledAt: string;
}

export interface PaymentProvider {
  readonly kind: PaymentMethod;

  createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentResult>;
  getPaymentStatus(input: GetPaymentStatusInput): Promise<PaymentStatusResult>;
  cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentResult>;
}

export const PAYMENT_PROVIDER = Symbol.for('casas.ports.PaymentProvider');
