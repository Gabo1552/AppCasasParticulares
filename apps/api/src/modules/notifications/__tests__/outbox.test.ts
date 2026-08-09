import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { OutboxProcessorWorker } from '../outbox-processor.worker';
import { FieldEncryptionService } from '../../../common/crypto/field-encryption.service';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { AppConfig } from '../../../config/app-config';

/**
 * El worker del outbox (ADR 0003).
 *
 * Lo que estas pruebas protegen es un defecto concreto que existió: el payload se
 * sanitizaba en **cada** fallo, así que el reintento se quedaba sin ciphertext y
 * el OTP no llegaba nunca. Un retry que no puede reintentar es peor que no tener
 * retry, porque parece que lo tenés.
 */

const KEY = randomBytes(32).toString('base64');

function makeConfig(): AppConfig {
  return {
    SMTP_HOST: 'localhost',
    SMTP_PORT: 1025,
    SMTP_SECURE: false,
    MAIL_FROM: 'no-reply@casas.local',
    FIELD_ENCRYPTION_KEYS: `v1:${KEY}`,
    FIELD_ENCRYPTION_ACTIVE_KEY_ID: 'v1',
  } as AppConfig;
}

interface Fixture {
  worker: OutboxProcessorWorker;
  update: ReturnType<typeof vi.fn>;
  sendMail: ReturnType<typeof vi.fn>;
  encryption: FieldEncryptionService;
}

/**
 * Arma el worker con un doble de Prisma cuyo claim devuelve `rows`.
 *
 * El claim real usa `$queryRaw` con `FOR UPDATE SKIP LOCKED` dentro de una
 * transacción; acá se sustituye la transacción entera porque lo que se está
 * verificando es el tratamiento del payload, no el bloqueo. El bloqueo se
 * verifica contra PostgreSQL de verdad en la prueba de integración.
 */
function makeWorker(rows: unknown[], sendMailImpl: () => Promise<unknown>): Fixture {
  const update = vi.fn().mockResolvedValue({});
  const sendMail = vi.fn().mockImplementation(sendMailImpl);

  const prisma = {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $queryRaw: async () => rows,
        outboxMessage: { updateMany: vi.fn().mockResolvedValue({ count: rows.length }) },
      }),
    outboxMessage: { update },
  } as unknown as PrismaService;

  const config = makeConfig();
  const encryption = new FieldEncryptionService(config);
  const worker = new OutboxProcessorWorker(prisma, encryption, config);
  (worker as unknown as { transporter: { sendMail: typeof sendMail } }).transporter = { sendMail };

  return { worker, update, sendMail, encryption };
}

function otpRow(encryptedOtp: string, attempts = 0) {
  return {
    id: 'msg-1',
    topic: 'notification.send_email',
    payload: {
      to: 'persona@ejemplo-ficticio.test',
      subject: 'Tu código de ingreso',
      isOtp: true,
      encryptedOtp,
      ttlMinutes: 10,
    },
    attempts,
  };
}

/** Extrae el `data` del último `update` que hizo el worker. */
function lastUpdateData(update: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = update.mock.calls.at(-1) as [{ data: Record<string, unknown> }];
  return call[0].data;
}

describe('Worker del outbox: reintentos de OTP', () => {
  it('un fallo de SMTP conserva el ciphertext para que el reintento pueda usarlo', async () => {
    const encryption = new FieldEncryptionService(makeConfig());
    const encrypted = encryption.encrypt('123456');

    const { worker, update } = makeWorker([otpRow(encrypted)], () => {
      throw new Error('SMTP no disponible');
    });

    await worker.processPendingMessages();

    const data = lastUpdateData(update);
    expect(data.status).toBe('PENDING');
    expect(data.attempts).toBe(1);
    // Lo esencial: el payload no se tocó, así que el ciphertext sigue ahí.
    expect(data.payload).toBeUndefined();
  });

  it('el segundo intento descifra el mismo OTP y lo envía', async () => {
    const encryption = new FieldEncryptionService(makeConfig());
    const encrypted = encryption.encrypt('123456');

    // Primer intento: falla y deja el payload intacto.
    const primero = makeWorker([otpRow(encrypted)], () => {
      throw new Error('SMTP no disponible');
    });
    await primero.worker.processPendingMessages();
    expect(lastUpdateData(primero.update).payload).toBeUndefined();

    // Segundo intento sobre el mismo mensaje, con attempts ya incrementado.
    const segundo = makeWorker([otpRow(encrypted, 1)], async () => ({ messageId: 'ok' }));
    await segundo.worker.processPendingMessages();

    expect(segundo.sendMail).toHaveBeenCalledTimes(1);
    const enviado = segundo.sendMail.mock.calls[0]![0] as { text: string };
    expect(enviado.text).toContain('123456');
  });

  it('tras el envío exitoso el OTP se retira del payload', async () => {
    const encryption = new FieldEncryptionService(makeConfig());
    const encrypted = encryption.encrypt('123456');

    const { worker, update } = makeWorker([otpRow(encrypted)], async () => ({ messageId: 'ok' }));
    await worker.processPendingMessages();

    const data = lastUpdateData(update);
    expect(data.status).toBe('DELIVERED');
    expect(data.processedAt).toBeInstanceOf(Date);

    const payload = data.payload as Record<string, unknown>;
    expect(payload.encryptedOtp).toBeUndefined();
    expect(payload.otpRedactedAt).toEqual(expect.any(String));
    // El destinatario se conserva: hace falta para auditar que se envió.
    expect(payload.to).toBe('persona@ejemplo-ficticio.test');
  });

  it('al quinto fallo pasa a dead-letter y recién ahí sanitiza el payload', async () => {
    const encryption = new FieldEncryptionService(makeConfig());
    const encrypted = encryption.encrypt('123456');

    // attempts=4 → este intento es el quinto.
    const { worker, update } = makeWorker([otpRow(encrypted, 4)], () => {
      throw new Error('SMTP no disponible');
    });
    await worker.processPendingMessages();

    const data = lastUpdateData(update);
    expect(data.status).toBe('DEAD_LETTER');
    expect(data.attempts).toBe(5);
    expect(String(data.lastError)).toContain('DEAD_LETTER');

    const payload = data.payload as Record<string, unknown>;
    expect(payload.encryptedOtp).toBeUndefined();
    expect(payload.otpRedactedAt).toEqual(expect.any(String));
  });

  it('el error guardado no puede filtrar el código', async () => {
    const encryption = new FieldEncryptionService(makeConfig());
    const encrypted = encryption.encrypt('123456');

    const { worker, update } = makeWorker([otpRow(encrypted)], () => {
      // Algunos servidores SMTP devuelven el mensaje rechazado dentro del error.
      throw new Error('550 rechazado: "Tu código para ingresar es: 123456"');
    });
    await worker.processPendingMessages();

    expect(String(lastUpdateData(update).lastError)).not.toContain('123456');
  });

  it('el mensaje que no es OTP no gana campos de redacción', async () => {
    const fila = {
      id: 'msg-2',
      topic: 'notification.send_email',
      payload: { to: 'a@ejemplo-ficticio.test', subject: 'Aviso', text: 'Hola' },
      attempts: 0,
    };
    const { worker, update } = makeWorker([fila], async () => ({ messageId: 'ok' }));
    await worker.processPendingMessages();

    const payload = lastUpdateData(update).payload as Record<string, unknown>;
    expect(payload.otpRedactedAt).toBeUndefined();
    expect(payload.text).toBe('Hola');
  });

  it('el ciclo completo funciona con una clave rotada', async () => {
    // El OTP se cifró con v1; para cuando el worker lo procesa, la activa es v2.
    const v1 = randomBytes(32).toString('base64');
    const v2 = randomBytes(32).toString('base64');

    const antes = new FieldEncryptionService({
      FIELD_ENCRYPTION_KEYS: `v1:${v1}`,
      FIELD_ENCRYPTION_ACTIVE_KEY_ID: 'v1',
    } as AppConfig);
    const encrypted = antes.encrypt('424242');

    const update = vi.fn().mockResolvedValue({});
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'ok' });
    const rows = [otpRow(encrypted)];
    const prisma = {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          $queryRaw: async () => rows,
          outboxMessage: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        }),
      outboxMessage: { update },
    } as unknown as PrismaService;

    const configRotado = {
      ...makeConfig(),
      FIELD_ENCRYPTION_KEYS: `v1:${v1},v2:${v2}`,
      FIELD_ENCRYPTION_ACTIVE_KEY_ID: 'v2',
    } as AppConfig;

    const worker = new OutboxProcessorWorker(
      prisma,
      new FieldEncryptionService(configRotado),
      configRotado,
    );
    (worker as unknown as { transporter: { sendMail: typeof sendMail } }).transporter = {
      sendMail,
    };

    await worker.processPendingMessages();

    expect((sendMail.mock.calls[0]![0] as { text: string }).text).toContain('424242');
  });
});
