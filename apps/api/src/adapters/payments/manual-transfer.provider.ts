import {
  PaymentMethod,
  PaymentStatus,
  type CancelPaymentInput,
  type CancelPaymentResult,
  type CreatePaymentIntentInput,
  type GetPaymentStatusInput,
  type PaymentIntentResult,
  type PaymentProvider,
  type PaymentStatusResult,
} from '@casas/domain';

/**
 * Proveedor de pago por transferencia manual — la implementación del MVP.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  EL DINERO NO PASA POR LA PLATAFORMA.
 *
 *  Este proveedor no mueve fondos. La familia transfiere desde su homebanking
 *  directamente a la cuenta de la trabajadora, y acá se registra el movimiento
 *  con su comprobante, importe, fecha, referencia externa y cuenta enmascarada.
 *
 *  No es un stub: es un camino completo con conciliación e idempotencia, que
 *  PAG-10 contempla explícitamente ("permitir carga manual de pagos realizados
 *  fuera de la app"). Cuando exista un PSP habilitado por el BCRA (OD-05), se
 *  agregará otra implementación de `PaymentProvider` sin tocar el dominio.
 *
 *  Referencias: principios 3 y 4 del encargo; PAG-01, PAG-02, PAG-05, PAG-07,
 *  PAG-10; sección 13.3 del documento.
 * ════════════════════════════════════════════════════════════════════════════
 */

export interface ManualTransferProviderDeps {
  /**
   * Registra el pago o devuelve el existente si la clave de idempotencia ya se usó.
   * `created` distingue un alta de una repetición (PAG-07, INV-PAGO-02).
   */
  upsertPayment(input: {
    employmentRelationshipId: string;
    payrollPeriodId: string;
    payrollVersionId: string;
    workerBankAccountId: string;
    amount: string;
    idempotencyKey: string;
    registeredByUserId: string;
  }): Promise<{ paymentId: string; created: boolean; status: PaymentStatus; createdAt: string }>;

  loadPayment(paymentId: string): Promise<{
    paymentId: string;
    status: PaymentStatus;
    amount: string;
    externalReference: string | null;
    proofDocumentId: string | null;
    registeredAt: string | null;
    confirmedAt: string | null;
  }>;

  cancelPayment(input: {
    paymentId: string;
    reason: string;
    cancelledByUserId: string;
  }): Promise<{ cancelledAt: string }>;
}

export class ManualTransferProvider implements PaymentProvider {
  readonly kind = PaymentMethod.MANUAL_TRANSFER;

  constructor(private readonly deps: ManualTransferProviderDeps) {}

  /**
   * Registra la intención de pago.
   *
   * No inicia una transferencia: devuelve las instrucciones para que la familia la
   * haga por su propio medio, y deja el registro listo para asociarle el comprobante.
   */
  async createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentResult> {
    if (input.method !== PaymentMethod.MANUAL_TRANSFER) {
      throw new Error(
        `ManualTransferProvider sólo admite MANUAL_TRANSFER. Recibido: ${input.method}. ` +
          'La iniciación por PSP requiere un proveedor habilitado (OD-05).',
      );
    }

    // El tipo `WorkerPayoutTarget` ya impide expresar otro destino, pero la
    // verificación en tiempo de ejecución protege contra datos que vengan de la base.
    if (input.target.kind !== 'WORKER_BANK_ACCOUNT') {
      throw new Error(
        'El destino de un pago de sueldo sólo puede ser la cuenta de la trabajadora ' +
          '(principios 3 y 4 del encargo, PAG-02).',
      );
    }

    const result = await this.deps.upsertPayment({
      employmentRelationshipId: input.employmentRelationshipId,
      payrollPeriodId: input.payrollPeriodId,
      payrollVersionId: input.payrollVersionId,
      workerBankAccountId: input.target.workerBankAccountId,
      amount: input.amount,
      idempotencyKey: input.idempotencyKey,
      registeredByUserId: input.initiatedByUserId,
    });

    return {
      paymentId: result.paymentId,
      status: result.status,
      method: PaymentMethod.MANUAL_TRANSFER,
      amount: input.amount,
      currency: input.currency,
      externalReference: null,
      instructions: [
        'Realizá la transferencia desde tu homebanking o billetera a la cuenta de la trabajadora.',
        `Cuenta destino: ${input.target.accountKind} terminada en ${input.target.last4}.`,
        `Importe: ${input.amount} ${input.currency}.`,
        'Adjuntá el comprobante en la aplicación para que el período pueda conciliarse.',
        'El dinero va directo de tu cuenta a la de la trabajadora: la plataforma no lo recibe.',
      ],
      createdAt: result.createdAt,
      // Invariante estructural: no existe cuenta de plataforma en este flujo.
      fundsHeldByPlatform: false,
    };
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<PaymentStatusResult> {
    const payment = await this.deps.loadPayment(input.paymentId);

    return {
      paymentId: payment.paymentId,
      status: payment.status,
      amount: payment.amount,
      currency: 'ARS',
      externalReference: payment.externalReference,
      proofDocumentId: payment.proofDocumentId,
      registeredAt: payment.registeredAt,
      confirmedAt: payment.confirmedAt,
    };
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentResult> {
    const payment = await this.deps.loadPayment(input.paymentId);

    // Un pago ya confirmado por la trabajadora no se cancela desde la aplicación:
    // el dinero se movió fuera de la plataforma y anular el registro escondería
    // un hecho ocurrido. Corresponde una rectificación, que queda auditada.
    if (payment.status === PaymentStatus.CONFIRMED) {
      throw new Error(
        'No se puede cancelar un pago ya confirmado por la trabajadora. ' +
          'Si hubo un error, corresponde registrar una rectificación (RN-06).',
      );
    }

    const result = await this.deps.cancelPayment(input);

    return {
      paymentId: input.paymentId,
      status: PaymentStatus.CANCELLED,
      cancelledAt: result.cancelledAt,
    };
  }
}
