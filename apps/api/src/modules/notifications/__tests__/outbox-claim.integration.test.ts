import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@casas/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { OutboxProcessorWorker } from '../outbox-processor.worker';
import { FieldEncryptionService } from '../../../common/crypto/field-encryption.service';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { AppConfig } from '../../../config/app-config';

/**
 * El claim del outbox contra PostgreSQL real.
 *
 * `FOR UPDATE SKIP LOCKED` no se puede verificar con un doble: lo que se está
 * probando **es** el comportamiento del motor bajo bloqueo concurrente. Con dos
 * instancias del worker corriendo a la vez, el patrón anterior
 * (`findMany` → `sendMail` → `update`) hacía que las dos seleccionaran la misma
 * fila y el correo saliera dos veces.
 *
 * Requiere PostgreSQL con las migraciones aplicadas.
 * Local: `pnpm docker:up && pnpm db:migrate`.
 */

const prisma = new PrismaClient();
const KEY = randomBytes(32).toString('base64');
const TOPIC = 'notification.send_email';

const config = {
  SMTP_HOST: 'localhost',
  SMTP_PORT: 1025,
  SMTP_SECURE: false,
  MAIL_FROM: 'no-reply@casas.local',
  FIELD_ENCRYPTION_KEYS: `v1:${KEY}`,
  FIELD_ENCRYPTION_ACTIVE_KEY_ID: 'v1',
} as AppConfig;

/** Un worker con SMTP sustituido, que registra qué mensajes envió. */
function makeWorker(): { worker: OutboxProcessorWorker; sent: string[] } {
  const sent: string[] = [];
  const worker = new OutboxProcessorWorker(
    prisma as unknown as PrismaService,
    new FieldEncryptionService(config),
    config,
  );
  (
    worker as unknown as { transporter: { sendMail: (m: { to: string }) => Promise<unknown> } }
  ).transporter = {
    sendMail: vi.fn(async (message: { to: string }) => {
      sent.push(message.to);
      return { messageId: randomUUID() };
    }),
  };
  return { worker, sent };
}

async function enqueue(to: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const created = await prisma.outboxMessage.create({
    data: {
      topic: TOPIC,
      payload: { to, subject: 'Prueba de claim', text: 'cuerpo' },
      availableAt: new Date(),
      ...overrides,
    },
  });
  return created.id;
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.outboxMessage.deleteMany({ where: { topic: TOPIC } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.outboxMessage.deleteMany({ where: { topic: TOPIC } });
});

describe('Claim del outbox con múltiples instancias', () => {
  it('dos workers concurrentes no envían el mismo mensaje dos veces', async () => {
    const id = await enqueue('unico@ejemplo-ficticio.test');

    const a = makeWorker();
    const b = makeWorker();

    // Arrancan a la vez: es la condición de carrera que el claim tiene que
    // resolver. Sin SKIP LOCKED, ambos veían la fila y ambos enviaban.
    await Promise.all([a.worker.processPendingMessages(), b.worker.processPendingMessages()]);

    const envios = a.sent.length + b.sent.length;
    expect(envios).toBe(1);

    const row = await prisma.outboxMessage.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('DELIVERED');
    expect(row.processedAt).not.toBeNull();
  });

  it('un lote se reparte entre instancias sin solaparse', async () => {
    const ids = await Promise.all(
      Array.from({ length: 8 }, (_, index) => enqueue(`lote-${index}@ejemplo-ficticio.test`)),
    );

    const a = makeWorker();
    const b = makeWorker();
    await Promise.all([a.worker.processPendingMessages(), b.worker.processPendingMessages()]);

    const enviados = [...a.sent, ...b.sent];
    // Ninguno se envió dos veces y todos se enviaron una.
    expect(new Set(enviados).size).toBe(enviados.length);
    expect(enviados).toHaveLength(ids.length);

    const rows = await prisma.outboxMessage.findMany({ where: { id: { in: ids } } });
    expect(rows.every((row) => row.status === 'DELIVERED')).toBe(true);
  });

  it('un mensaje reclamado no lo toma otra instancia mientras el lease esté vigente', async () => {
    // Simula la instancia que murió justo después del claim: quedó PROCESSING
    // con un lease todavía vigente.
    const id = await enqueue('colgado@ejemplo-ficticio.test', {
      status: 'PROCESSING',
      processingBy: 'instancia-que-murio',
      processingStartedAt: new Date(),
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });

    const { worker, sent } = makeWorker();
    await worker.processPendingMessages();

    expect(sent).toHaveLength(0);
    const row = await prisma.outboxMessage.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('PROCESSING');
    expect(row.processingBy).toBe('instancia-que-murio');
  });

  it('con el lease vencido otra instancia lo recupera', async () => {
    const id = await enqueue('recuperado@ejemplo-ficticio.test', {
      status: 'PROCESSING',
      processingBy: 'instancia-que-murio',
      processingStartedAt: new Date(Date.now() - 120_000),
      leaseExpiresAt: new Date(Date.now() - 60_000),
    });

    const { worker, sent } = makeWorker();
    await worker.processPendingMessages();

    expect(sent).toEqual(['recuperado@ejemplo-ficticio.test']);
    const row = await prisma.outboxMessage.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('DELIVERED');
    expect(row.processingBy).toBeNull();
    expect(row.leaseExpiresAt).toBeNull();
  });

  it('no toma mensajes que todavía esperan su próximo intento', async () => {
    await enqueue('futuro@ejemplo-ficticio.test', {
      availableAt: new Date(Date.now() + 3_600_000),
      attempts: 1,
    });

    const { worker, sent } = makeWorker();
    await worker.processPendingMessages();

    expect(sent).toHaveLength(0);
  });

  it('no toma mensajes que agotaron los intentos', async () => {
    await enqueue('agotado@ejemplo-ficticio.test', { attempts: 5, status: 'DEAD_LETTER' });

    const { worker, sent } = makeWorker();
    await worker.processPendingMessages();

    expect(sent).toHaveLength(0);
  });
});

describe('El OTP sobrevive al reintento contra la base real', () => {
  it('el ciphertext sigue en la fila después de un fallo de SMTP', async () => {
    const encryption = new FieldEncryptionService(config);
    const encryptedOtp = encryption.encrypt('135790');

    const created = await prisma.outboxMessage.create({
      data: {
        topic: TOPIC,
        payload: {
          to: 'otp@ejemplo-ficticio.test',
          subject: 'Tu código de ingreso',
          isOtp: true,
          encryptedOtp,
          ttlMinutes: 10,
        },
        availableAt: new Date(),
      },
    });

    // Primer intento: SMTP falla.
    const fallando = new OutboxProcessorWorker(
      prisma as unknown as PrismaService,
      new FieldEncryptionService(config),
      config,
    );
    (fallando as unknown as { transporter: { sendMail: () => Promise<unknown> } }).transporter = {
      sendMail: vi.fn().mockRejectedValue(new Error('SMTP caído')),
    };
    await fallando.processPendingMessages();

    const traFallo = await prisma.outboxMessage.findUniqueOrThrow({ where: { id: created.id } });
    expect(traFallo.status).toBe('PENDING');
    expect(traFallo.attempts).toBe(1);
    expect((traFallo.payload as Record<string, unknown>).encryptedOtp).toBe(encryptedOtp);

    // Segundo intento: el mensaje ya está disponible y SMTP funciona.
    await prisma.outboxMessage.update({
      where: { id: created.id },
      data: { availableAt: new Date(Date.now() - 1000) },
    });

    const { worker, sent } = makeWorker();
    await worker.processPendingMessages();

    expect(sent).toEqual(['otp@ejemplo-ficticio.test']);

    const traExito = await prisma.outboxMessage.findUniqueOrThrow({ where: { id: created.id } });
    expect(traExito.status).toBe('DELIVERED');
    // Recién en el estado terminal se retira el OTP.
    expect((traExito.payload as Record<string, unknown>).encryptedOtp).toBeUndefined();
    expect((traExito.payload as Record<string, unknown>).otpRedactedAt).toEqual(expect.any(String));
  });
});
