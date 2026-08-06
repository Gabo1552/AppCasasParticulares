/**
 * Preparación del entorno de las pruebas de la API.
 *
 * Se ejecuta **antes** de cualquier import de la aplicación, y eso importa por
 * dos motivos:
 *
 *  - `reflect-metadata` tiene que estar cargado antes de que se evalúen los
 *    decoradores, o Nest no puede resolver las dependencias por tipo.
 *  - `loadAppConfig()` corre al importar el módulo raíz, así que las variables
 *    tienen que existir para entonces.
 */
import 'reflect-metadata';

const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3001',
  API_BASE_URL: 'http://localhost:3001',
  WEB_BASE_URL: 'http://localhost:3000',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
  DATABASE_URL:
    process.env['DATABASE_URL'] ??
    'postgresql://casas:casas_dev_password@localhost:5432/casas?schema=public',
  REDIS_URL: 'redis://localhost:6379',
  STORAGE_ENDPOINT: 'http://localhost:9000',
  STORAGE_REGION: 'us-east-1',
  STORAGE_BUCKET: 'casas-documents',
  STORAGE_ACCESS_KEY: 'test_access',
  STORAGE_SECRET_KEY: 'test_secret',
  JWT_ACCESS_SECRET: 'test-only-access-secret-con-mas-de-32-caracteres',
  JWT_REFRESH_SECRET: 'test-only-refresh-secret-con-mas-de-32-caracteres',
  FIELD_ENCRYPTION_KEY: 'test-only-field-encryption-key-32-chars',
  FIELD_ENCRYPTION_KEY_ID: 'test-key-1',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  FEATURE_TEST_SUPPORT_ENDPOINTS: 'true',
};

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ??= value;
}
