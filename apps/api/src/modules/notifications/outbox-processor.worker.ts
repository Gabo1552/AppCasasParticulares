import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { FieldEncryptionService } from '../../common/crypto/field-encryption.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;
const POLL_INTERVAL_MS = 3000;

/**
 * Duración del lease de un mensaje reclamado.
 *
 * Tiene que superar con holgura el timeout de SMTP: si venciera mientras el envío
 * sigue en curso, otra instancia tomaría el mismo mensaje y el correo saldría dos
 * veces, que es justamente lo que el claim viene a evitar.
 */
const LEASE_MS = 60_000;

interface ClaimedMessage {
  id: string;
  topic: string;
  payload: Record<string, unknown>;
  attempts: number;
}

/**
 * Worker del outbox (docs/adr/0003-otp-outbox-security.md).
 *
 * Dos propiedades que el diseño anterior no tenía:
 *
 * 1. **El claim es seguro entre instancias.** `FOR UPDATE SKIP LOCKED` dentro de
 *    una transacción corta marca los mensajes como `PROCESSING` con un lease. Un
 *    booleano en memoria sólo protege un proceso; en cuanto hay dos réplicas, dos
 *    workers seleccionan la misma fila y el correo sale duplicado.
 *
 * 2. **El reintento conserva el OTP cifrado.** Sanitizar el payload en cada fallo
 *    dejaba el ciphertext irrecuperable y convertía el retry en un trámite: el
 *    segundo intento ya no tenía qué enviar.
 *
 * SMTP nunca ocurre dentro de una transacción: la transacción termina en el claim.
 */
@Injectable()
export class OutboxProcessorWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxProcessorWorker.name);
  private readonly transporter: Transporter;
  /** Identifica a esta instancia en `processingBy`, para diagnosticar bloqueos. */
  private readonly instanceId = `${hostname()}#${process.pid}#${randomUUID().slice(0, 8)}`;
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly fieldEncryption: FieldEncryptionService,
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
    this.timer = setInterval(() => {
      void this.processPendingMessages();
    }, POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Reclama un lote y lo procesa.
   *
   * `isProcessing` se conserva sólo para no solapar dos corridas del mismo timer.
   * La exclusión entre instancias la da la base, no este booleano.
   */
  async processPendingMessages(): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    try {
      const claimed = await this.claimBatch();
      for (const message of claimed) {
        await this.processMessage(message);
      }
      return claimed.length;
    } catch (error) {
      this.logger.error(`Error en worker de outbox: ${(error as Error).message}`);
      return 0;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Toma un lote en exclusiva.
   *
   * Elegibles: los `PENDING` que ya vencieron su espera, y los `PROCESSING` cuyo
   * lease expiró — esos últimos son los que quedaron colgados porque la instancia
   * que los tenía murió. `SKIP LOCKED` hace que dos workers concurrentes se
   * repartan el trabajo en vez de bloquearse.
   */
  private async claimBatch(): Promise<ClaimedMessage[]> {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; topic: string; payload: Record<string, unknown>; attempts: number }[]
      >`
        SELECT "id", "topic", "payload", "attempts"
        FROM "outbox_message"
        WHERE "availableAt" <= ${now}
          AND "attempts" < ${MAX_ATTEMPTS}
          AND (
            "status" = 'PENDING'
            OR ("status" = 'PROCESSING' AND "leaseExpiresAt" IS NOT NULL AND "leaseExpiresAt" <= ${now})
          )
        ORDER BY "createdAt" ASC
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `;

      if (rows.length === 0) return [];

      await tx.outboxMessage.updateMany({
        where: { id: { in: rows.map((row) => row.id) } },
        data: {
          status: 'PROCESSING',
          processingBy: this.instanceId,
          processingStartedAt: now,
          leaseExpiresAt,
        },
      });

      return rows;
    });
  }

  private async processMessage(message: ClaimedMessage): Promise<void> {
    const payload = message.payload;
    const attempts = message.attempts + 1;
    const isOtp = payload.isOtp === true;

    try {
      if (message.topic === 'notification.send_email') {
        await this.transporter.sendMail({
          from: this.config.MAIL_FROM,
          to: payload.to as string,
          subject: payload.subject as string,
          text: this.renderBody(payload),
        });
      }

      // Entregado: recién acá el OTP deja de ser necesario y se retira.
      await this.prisma.outboxMessage.update({
        where: { id: message.id },
        data: {
          status: 'DELIVERED',
          processedAt: new Date(),
          payload: redactOtp(payload) as object,
          lastError: null,
          processingBy: null,
          leaseExpiresAt: null,
        },
      });
    } catch (error) {
      const reason = sanitizeError((error as Error).message ?? 'Fallo en envío SMTP', isOtp);
      const isDeadLetter = attempts >= MAX_ATTEMPTS;

      // Backoff exponencial: 5s, 15s, 45s, 135s.
      const availableAt = new Date(Date.now() + Math.pow(3, attempts - 1) * 5000);

      await this.prisma.outboxMessage.update({
        where: { id: message.id },
        data: {
          attempts,
          status: isDeadLetter ? 'DEAD_LETTER' : 'PENDING',
          // Mientras el mensaje sea reintentable el payload queda intacto: sin el
          // ciphertext, el próximo intento no tendría OTP que enviar.
          ...(isDeadLetter ? { payload: redactOtp(payload) as object } : {}),
          ...(isDeadLetter ? { processedAt: new Date() } : { availableAt }),
          lastError: isDeadLetter ? `DEAD_LETTER: ${reason}` : reason,
          processingBy: null,
          leaseExpiresAt: null,
        },
      });

      this.logger.warn(
        `Fallo al procesar OutboxMessage ${message.id} (intento ${attempts}/${MAX_ATTEMPTS}): ${reason}`,
      );
    }
  }

  /** Arma el cuerpo del correo, descifrando el OTP sólo en este punto. */
  private renderBody(payload: Record<string, unknown>): string {
    if (payload.isOtp === true && typeof payload.encryptedOtp === 'string') {
      const rawOtp = this.fieldEncryption.decrypt(payload.encryptedOtp);
      const ttlMinutes = (payload.ttlMinutes as number | undefined) ?? 10;
      return [
        'Hola,',
        '',
        `Tu código para ingresar es: ${rawOtp}`,
        '',
        `Vence en ${ttlMinutes} minutos y sirve una sola vez.`,
        'Si no pediste este código, podés ignorar este mensaje.',
      ].join('\n');
    }
    return (payload.text as string | undefined) ?? '';
  }
}

/**
 * Retira el OTP del payload dejando constancia de que existió.
 *
 * Se elimina la clave en lugar de reemplazarla por una máscara: un `'******'`
 * guardado donde se espera un ciphertext hace que un lector posterior crea que
 * hay algo que descifrar.
 */
function redactOtp(payload: Record<string, unknown>): Record<string, unknown> {
  if (payload.isOtp !== true) return payload;
  const { encryptedOtp: _discarded, ...rest } = payload;
  return { ...rest, otpRedactedAt: new Date().toISOString() };
}

/**
 * Recorta el error y le quita cualquier secuencia que pueda ser el código.
 *
 * Algunos servidores SMTP devuelven parte del mensaje rechazado dentro del error,
 * y ese mensaje contiene el OTP en claro.
 */
function sanitizeError(message: string, isOtp: boolean): string {
  const truncated = message.slice(0, 500);
  return isOtp ? truncated.replace(/\d{4,}/g, '****') : truncated;
}
