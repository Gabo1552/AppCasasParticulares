import { z } from 'zod';

/**
 * Configuración de la aplicación, validada al arrancar.
 *
 * Si falta o está mal una variable, el proceso no arranca. Es preferible a
 * descubrirlo cuando un usuario intenta subir un documento y el bucket no existe.
 *
 * **No hay ninguna variable de clave fiscal de ARCA**, y no debe agregarse:
 * la aplicación no la solicita ni la almacena (SEG-06, principio 5).
 */

const booleanFromString = z.enum(['true', 'false']).transform((value) => value === 'true');

export const appConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),

  API_BASE_URL: z.string().url(),
  WEB_BASE_URL: z.string().url(),

  /** Lista explícita de orígenes. Nunca `*` (docs/security-model.md §5). */
  CORS_ALLOWED_ORIGINS: z
    .string()
    .min(1)
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  STORAGE_ENDPOINT: z.string().url(),
  STORAGE_REGION: z.string().min(1),
  STORAGE_BUCKET: z.string().min(1),
  STORAGE_ACCESS_KEY: z.string().min(1),
  STORAGE_SECRET_KEY: z.string().min(1),
  STORAGE_FORCE_PATH_STYLE: booleanFromString.default('true'),

  JWT_ACCESS_SECRET: z.string().min(32, 'El secreto de acceso debe tener al menos 32 caracteres.'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'El secreto de refresco debe tener al menos 32 caracteres.'),
  FIELD_ENCRYPTION_KEY: z
    .string()
    .min(32, 'La clave de cifrado debe tener al menos 32 caracteres.'),
  FIELD_ENCRYPTION_KEY_ID: z.string().min(1),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // ── Correo saliente ───────────────────────────────────────────────────────
  // En desarrollo apunta a Mailpit, que captura todo y no deja salir nada.
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_SECURE: booleanFromString.default('false'),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(1).default('Casas Particulares <no-responder@casasparticulares.local>'),

  /**
   * Endpoints de apoyo para las pruebas automatizadas (obtener el último código
   * OTP o el token de una invitación sin leer el buzón).
   *
   * Se valida además contra NODE_ENV: `loadAppConfig` rechaza el arranque si
   * llega en `true` con NODE_ENV=production. Sin esa doble condición, una
   * variable mal puesta abriría una puerta de entrada sin autenticación.
   */
  FEATURE_TEST_SUPPORT_ENDPOINTS: booleanFromString.default('false'),
  TEST_SUPPORT_SECRET: z.string().min(16).default('test-support-secret-32-chars-length'),

  // ── Feature flags ─────────────────────────────────────────────────────────
  /**
   * Integración oficial con ARCA. Con `false` se resuelve el conector asistido.
   * Las siete condiciones para encenderlo están en
   * docs/arca-integration-strategy.md §6.
   */
  FEATURE_ARCA_OFFICIAL_CONNECTOR: booleanFromString.default('false'),
  /** Reservado. Sin código detrás en esta etapa. */
  FEATURE_MARKETPLACE: booleanFromString.default('false'),
  /** Reservado para un PSP habilitado por el BCRA (OD-05). */
  FEATURE_REAL_PAYMENTS: booleanFromString.default('false'),
  FEATURE_IDENTITY_VERIFICATION: booleanFromString.default('false'),
  FEATURE_MFA_ENFORCED: booleanFromString.default('false'),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

export const APP_CONFIG = Symbol.for('casas.AppConfig');

/**
 * Carga y valida la configuración.
 *
 * Los errores se listan todos juntos: arrancar, fallar por una variable, corregirla
 * y volver a fallar por la siguiente es una pérdida de tiempo evitable.
 */
export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = appConfigSchema.safeParse(env);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  · ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `La configuración de la aplicación es inválida:\n${problems}\n\n` +
        'Revisá .env.example para ver las variables esperadas.',
    );
  }

  const config = result.data;

  // En producción, ciertos valores de desarrollo son un error, no una advertencia.
  if (config.NODE_ENV === 'production') {
    const placeholders = [
      ['JWT_ACCESS_SECRET', config.JWT_ACCESS_SECRET],
      ['JWT_REFRESH_SECRET', config.JWT_REFRESH_SECRET],
      ['FIELD_ENCRYPTION_KEY', config.FIELD_ENCRYPTION_KEY],
    ].filter(([, value]) => (value ?? '').includes('dev-only'));

    if (placeholders.length > 0) {
      throw new Error(
        `Se detectaron secretos de desarrollo en producción: ${placeholders
          .map(([name]) => name)
          .join(', ')}. Generá valores propios desde el gestor de secretos.`,
      );
    }

    if (config.CORS_ALLOWED_ORIGINS.includes('*')) {
      throw new Error('CORS con "*" no está permitido en producción (docs/security-model.md §5).');
    }

    if (config.FEATURE_TEST_SUPPORT_ENDPOINTS) {
      throw new Error(
        'FEATURE_TEST_SUPPORT_ENDPOINTS expone códigos de acceso y tokens de invitación ' +
          'sin autenticación. No puede habilitarse en producción.',
      );
    }
  }

  if (config.FEATURE_TEST_SUPPORT_ENDPOINTS) {
    if (config.NODE_ENV !== 'test') {
      throw new Error(
        'FEATURE_TEST_SUPPORT_ENDPOINTS sólo puede habilitarse cuando NODE_ENV=test.',
      );
    }
    if (!config.TEST_SUPPORT_SECRET || config.TEST_SUPPORT_SECRET.length < 16) {
      throw new Error(
        'FEATURE_TEST_SUPPORT_ENDPOINTS exige definir TEST_SUPPORT_SECRET con al menos 16 caracteres.',
      );
    }
  }

  return config;
}
