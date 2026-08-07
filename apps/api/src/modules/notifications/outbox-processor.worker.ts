import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { PrismaService } from '../../common/prisma/prisma.service';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { decryptOtpPayload } from './outbox-notification.service';

const MAX_ATTEMPTS = 5;

/**
 * Worker asíncrono para procesar eventos de la tabla Outbox (docs/security-model.md §6, 14.1).
 *
 * Procesa notificaciones desacopladas de las transacciones de negocio. Implementa
 * retries con backoff exponencial, sanitización de payloads OTP y cola dead-letter.
 */
@Injectable()
export class OutboxProcessorWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxProcessorWorker.name);
  private readonly transporter: Transporter;
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    this.transporter = createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      ...(config.SMTP_USER === undefined
        ? {}
        : { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } }),
    });
  }

  onModuleInit(): void {
    // Inicia el procesamiento periódico cada 3 segundos
    this.timer = setInterval(() => {
      void this.processPendingMessages();
    }, 3000);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  /**
   * Procesa mensajes pendientes en el outbox.
   */
  async processPendingMessages(): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    let processedCount = 0;
    try {
      const now = new Date();
      const messages = await this.prisma.outboxMessage.findMany({
        where: {
          processedAt: null,
          availableAt: { lte: now },
          attempts: { lt: MAX_ATTEMPTS },
        },
        take: 20,
        orderBy: { createdAt: 'asc' },
      });

      for (const msg of messages) {
        await this.processMessage(msg);
        processedCount += 1;
      }
    } catch (error) {
      this.logger.error(`Error en worker de outbox: ${(error as Error).message}`);
    } finally {
      this.isProcessing = false;
    }

    return processedCount;
  }

  private async processMessage(msg: {
    id: string;
    topic: string;
    payload: unknown;
    attempts: number;
  }): Promise<void> {
    const payload = msg.payload as Record<string, unknown>;
    const attempts = msg.attempts + 1;

    try {
      if (msg.topic === 'notification.send_email') {
        const to = payload.to as string;
        const subject = payload.subject as string;
        let text = payload.text as string | undefined;

        if (payload.isOtp === true && typeof payload.encryptedOtp === 'string') {
          const rawOtp = decryptOtpPayload(payload.encryptedOtp, this.config.FIELD_ENCRYPTION_KEY);
          const ttlMinutes = (payload.ttlMinutes as number | undefined) ?? 10;
          text = [
            'Hola,',
            '',
            `Tu código para ingresar es: ${rawOtp}`,
            '',
            `Vence en ${ttlMinutes} minutos y sirve una sola vez.`,
            'Si no pediste este código, podés ignorar este mensaje.',
          ].join('\n');
        }

        await this.transporter.sendMail({
          from: this.config.MAIL_FROM,
          to,
          subject,
          text: text ?? '',
        });
      }

      // Éxito: se marca procesado y se sanitiza el payload (ADR 0003)
      const sanitizedPayload = {
        ...payload,
        ...(payload.isOtp === true ? { encryptedOtp: '******' } : {}),
      };

      await this.prisma.outboxMessage.update({
        where: { id: msg.id },
        data: {
          processedAt: new Date(),
          payload: sanitizedPayload as object,
          lastError: null,
        },
      });
    } catch (error) {
      const errMessage = (error as Error).message ?? 'Fallo en envío SMTP';
      const isDeadLetter = attempts >= MAX_ATTEMPTS;

      // Exponential backoff: 5s, 15s, 45s, 135s...
      const nextDelaySeconds = Math.pow(3, attempts - 1) * 5;
      const availableAt = new Date(Date.now() + nextDelaySeconds * 1000);

      const sanitizedPayload = {
        ...payload,
        ...(payload.isOtp === true ? { encryptedOtp: '******' } : {}),
      };

      await this.prisma.outboxMessage.update({
        where: { id: msg.id },
        data: {
          attempts,
          availableAt,
          lastError: isDeadLetter ? `DEAD_LETTER: ${errMessage}` : errMessage,
          payload: sanitizedPayload as object,
        },
      });

      this.logger.warn(
        `Fallo al procesar OutboxMessage ${msg.id} (intento ${attempts}/${MAX_ATTEMPTS}): ${errMessage}`,
      );
    }
  }
}
