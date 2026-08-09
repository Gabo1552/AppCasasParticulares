import { Injectable } from '@nestjs/common';
import { FieldEncryptionService } from '../../common/crypto/field-encryption.service';
import { type PrismaTx } from '../../common/prisma/prisma.service';

export interface EnqueueEmailInput {
  to: string;
  subject: string;
  text: string;
  isOtp?: boolean;
  rawOtp?: string;
  ttlMinutes?: number;
  correlationId?: string;
}

/**
 * Encolado en la tabla outbox.
 *
 * Recibe siempre el cliente transaccional de quien lo llama: el mensaje tiene que
 * persistir en la **misma** transacción que el cambio de negocio que lo motiva
 * (docs/adr/0003-otp-outbox-security.md). Si el encolado quedara fuera, un corte
 * entre el commit y el encolado haría desaparecer la notificación sin rastro.
 */
@Injectable()
export class OutboxNotificationService {
  constructor(private readonly fieldEncryption: FieldEncryptionService) {}

  async enqueueEmail(tx: PrismaTx, input: EnqueueEmailInput): Promise<void> {
    let payload: Record<string, unknown>;

    if (input.isOtp === true && input.rawOtp !== undefined) {
      // El OTP nunca se guarda en claro, ni siquiera dentro del payload del
      // outbox: la fila vive en la base hasta que se procesa y queda auditada.
      payload = {
        to: input.to,
        subject: input.subject,
        isOtp: true,
        encryptedOtp: this.fieldEncryption.encrypt(input.rawOtp),
        ttlMinutes: input.ttlMinutes ?? 10,
      };
    } else {
      payload = {
        to: input.to,
        subject: input.subject,
        text: input.text,
      };
    }

    await tx.outboxMessage.create({
      data: {
        topic: 'notification.send_email',
        payload: payload as object,
        correlationId: input.correlationId ?? null,
        availableAt: new Date(),
      },
    });
  }
}
