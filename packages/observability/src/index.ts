/**
 * @casas/observability — logs estructurados, correlación, salud y redacción.
 *
 * NFR-09: logs, métricas, trazas y tableros **sin secretos ni datos excesivos**.
 * Por eso la redacción no es opcional: está dentro del logger, no al lado.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import pino, { type Logger } from 'pino';
import { redact } from './redaction';

export { redact, maskAccountNumber, REDACTED, SENSITIVE_FIELD_NAMES } from './redaction';

// ─── Correlación ─────────────────────────────────────────────────────────────

export interface RequestContext {
  readonly correlationId: string;
  readonly userId?: string;
  readonly role?: string;
  readonly route?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Ejecuta una función dentro de un contexto de correlación. */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

export function newCorrelationId(): string {
  return randomUUID();
}

export const CORRELATION_HEADER = 'x-correlation-id';

// ─── Logger ──────────────────────────────────────────────────────────────────

export interface LoggerOptions {
  readonly level?: string;
  readonly service?: string;
  readonly pretty?: boolean;
}

/**
 * Crea el logger de la aplicación.
 *
 * Dos garantías, ambas en la configuración y no en el uso:
 *  - `redact` de pino borra los campos sensibles conocidos por ruta;
 *  - el `formatters.log` pasa todo el objeto por nuestro redactor, que además
 *    detecta patrones (22 dígitos, JWT, Bearer) en campos con nombre inocente.
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  return pino({
    level: options.level ?? process.env['LOG_LEVEL'] ?? 'info',
    base: { service: options.service ?? 'casas-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'password',
        'passwordHash',
        '*.password',
        '*.passwordHash',
        '*.cbu',
        '*.cvu',
        '*.token',
        '*.refreshToken',
        '*.numberCipher',
        '*.mfaSecretCipher',
      ],
      censor: '[REDACTADO]',
    },
    formatters: {
      level: (label) => ({ level: label }),
      log: (object) => {
        const context = getContext();
        const redacted = redact(object) as Record<string, unknown>;
        return context === undefined
          ? redacted
          : {
              ...redacted,
              correlationId: context.correlationId,
              ...(context.userId === undefined ? {} : { userId: context.userId }),
              ...(context.role === undefined ? {} : { role: context.role }),
            };
      },
    },
    ...(options.pretty === true
      ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
      : {}),
  });
}

// ─── Salud ───────────────────────────────────────────────────────────────────

export const HealthStatus = {
  UP: 'up',
  DOWN: 'down',
  DEGRADED: 'degraded',
} as const;
export type HealthStatus = (typeof HealthStatus)[keyof typeof HealthStatus];

export interface HealthCheckResult {
  readonly name: string;
  readonly status: HealthStatus;
  readonly durationMs: number;
  readonly detail?: string;
}

export interface HealthReport {
  readonly status: HealthStatus;
  readonly checks: readonly HealthCheckResult[];
  readonly checkedAt: string;
}

export type HealthCheck = () => Promise<{ status: HealthStatus; detail?: string }>;

/**
 * Ejecuta las verificaciones de dependencias.
 *
 * `/health` responde si el proceso está vivo; `/ready` corre esto, que verifica
 * que Postgres, Redis y el storage estén alcanzables. Un proceso vivo pero sin
 * base no debe recibir tráfico.
 */
export async function runHealthChecks(
  checks: Readonly<Record<string, HealthCheck>>,
): Promise<HealthReport> {
  const results: HealthCheckResult[] = [];

  for (const [name, check] of Object.entries(checks)) {
    const startedAt = Date.now();
    try {
      const outcome = await check();
      results.push({
        name,
        status: outcome.status,
        durationMs: Date.now() - startedAt,
        ...(outcome.detail === undefined ? {} : { detail: outcome.detail }),
      });
    } catch (error: unknown) {
      results.push({
        name,
        status: HealthStatus.DOWN,
        durationMs: Date.now() - startedAt,
        detail: error instanceof Error ? error.message : 'error desconocido',
      });
    }
  }

  const status = results.some((r) => r.status === HealthStatus.DOWN)
    ? HealthStatus.DOWN
    : results.some((r) => r.status === HealthStatus.DEGRADED)
      ? HealthStatus.DEGRADED
      : HealthStatus.UP;

  return { status, checks: results, checkedAt: new Date().toISOString() };
}
