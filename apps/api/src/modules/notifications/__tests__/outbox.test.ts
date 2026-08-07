import { describe, expect, it, vi } from 'vitest';
import { decryptOtpPayload, encryptOtpPayload } from '../outbox-notification.service';
import { OutboxProcessorWorker } from '../outbox-processor.worker';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { AppConfig } from '../../../config/app-config';

describe('Transactional Outbox y Seguridad OTP (ADR 0003)', () => {
  const SECRET_KEY = 'clave-de-prueba-de-32-caracteres!!';

  it('cifra y descifra correctamente un código OTP en memoria', () => {
    const rawOtp = '654321';
    const encrypted = encryptOtpPayload(rawOtp, SECRET_KEY);

    expect(encrypted).not.toContain(rawOtp);
    const decrypted = decryptOtpPayload(encrypted, SECRET_KEY);
    expect(decrypted).toBe(rawOtp);
  });

  it('el worker procesa mensajes outbox y sanitiza el payload OTP', async () => {
    const mockUpdate = vi.fn().mockResolvedValue({});
    const prisma = {
      outboxMessage: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'msg-1',
            topic: 'notification.send_email',
            payload: {
              to: 'test@example.com',
              subject: 'Tu código',
              isOtp: true,
              encryptedOtp: encryptOtpPayload('123456', SECRET_KEY),
              ttlMinutes: 10,
            },
            attempts: 0,
          },
        ]),
        update: mockUpdate,
      },
    } as unknown as PrismaService;

    const config = {
      SMTP_HOST: 'localhost',
      SMTP_PORT: 1025,
      SMTP_SECURE: false,
      MAIL_FROM: 'no-reply@casas.local',
      FIELD_ENCRYPTION_KEY: SECRET_KEY,
    } as AppConfig;

    const worker = new OutboxProcessorWorker(prisma, config);
    // Mock transporter sendMail
    (worker as unknown as { transporter: { sendMail: ReturnType<typeof vi.fn> } }).transporter = {
      sendMail: vi.fn().mockResolvedValue({ messageId: '123' }),
    };

    const processed = await worker.processPendingMessages();
    expect(processed).toBe(1);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'msg-1' },
        data: expect.objectContaining({
          payload: expect.objectContaining({ encryptedOtp: '******' }),
        }),
      }),
    );
  });
});
