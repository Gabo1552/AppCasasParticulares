import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService, type PrismaTx } from '../../common/prisma/prisma.service';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';

export function encryptOtpPayload(otp: string, secretKey: string, keyId = 'v1'): string {
  const key = Buffer.from(secretKey.padEnd(32, '0').slice(0, 32));
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(otp, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${keyId}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptOtpPayload(encryptedPayload: string, secretKey: string): string {
  const parts = encryptedPayload.split(':');
  let ivHex: string | undefined;
  let tagHex: string | undefined;
  let contentHex: string | undefined;

  if (parts.length === 4) {
    [, ivHex, tagHex, contentHex] = parts;
  } else if (parts.length === 3) {
    [ivHex, tagHex, contentHex] = parts;
  }

  if (!ivHex || !tagHex || !contentHex) throw new Error('Payload cifrado inválido.');
  const key = Buffer.from(secretKey.padEnd(32, '0').slice(0, 32));
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const content = Buffer.from(contentHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(content) + decipher.final('utf8');
}

export interface EnqueueEmailInput {
  to: string;
  subject: string;
  text: string;
  isOtp?: boolean;
  rawOtp?: string;
  ttlMinutes?: number;
  correlationId?: string;
}

@Injectable()
export class OutboxNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Encola un mensaje en la tabla outbox dentro de una transacción Prisma.
   */
  async enqueueEmail(tx: PrismaTx, input: EnqueueEmailInput): Promise<void> {
    const client = tx ?? this.prisma;

    let payload: Record<string, unknown>;

    if (input.isOtp && input.rawOtp) {
      const encryptedOtp = encryptOtpPayload(
        input.rawOtp,
        this.config.FIELD_ENCRYPTION_KEY,
        this.config.FIELD_ENCRYPTION_KEY_ID,
      );
      payload = {
        to: input.to,
        subject: input.subject,
        isOtp: true,
        encryptedOtp,
        ttlMinutes: input.ttlMinutes ?? 10,
      };
    } else {
      payload = {
        to: input.to,
        subject: input.subject,
        text: input.text,
      };
    }

    await client.outboxMessage.create({
      data: {
        topic: 'notification.send_email',
        payload: payload as object,
        correlationId: input.correlationId ?? null,
        availableAt: new Date(),
      },
    });
  }
}
