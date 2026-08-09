import { describe, expect, it } from 'vitest';
import { isTestSupportEnabled, OnboardingModule } from '../onboarding.module';
import { TestSupportController } from '../test-support/test-support.controller';
import { TestNotificationSink } from '../notifications/test-notification-sink';
import { loadAppConfig } from '../../config/app-config';

/**
 * Los endpoints de apoyo exponen el último código de acceso y el token de una
 * invitación **sin autenticación**. Rechazar la request en el handler no alcanza:
 * mientras el controlador esté declarado, la ruta existe, aparece en el árbol de
 * rutas de Nest y en OpenAPI. La prueba verifica que fuera de `NODE_ENV=test` el
 * controlador ni siquiera se registra.
 */

const BASE_ENV: Record<string, string> = {
  PORT: '3001',
  API_BASE_URL: 'http://localhost:3001',
  WEB_BASE_URL: 'http://localhost:3000',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://casas:test@localhost:5432/casas_test',
  REDIS_URL: 'redis://localhost:6379',
  STORAGE_ENDPOINT: 'http://localhost:9000',
  STORAGE_REGION: 'us-east-1',
  STORAGE_BUCKET: 'casas-documents',
  STORAGE_ACCESS_KEY: 'test_access',
  STORAGE_SECRET_KEY: 'test_secret',
  JWT_ACCESS_SECRET: 'produccion-access-secret-con-mas-de-32-caracteres',
  JWT_REFRESH_SECRET: 'produccion-refresh-secret-con-mas-de-32-caracteres',
  FIELD_ENCRYPTION_KEY: 'produccion-field-encryption-key-32-chars',
  FIELD_ENCRYPTION_KEYS: 'v1:vTJ+niLRgXbTlQCOQC+503f5ne6YFzrG2DSk0KJSC1w=',
  FIELD_ENCRYPTION_ACTIVE_KEY_ID: 'v1',
};

function envFor(nodeEnv: string, extra: Record<string, string> = {}): Record<string, string> {
  return { ...BASE_ENV, NODE_ENV: nodeEnv, ...extra };
}

describe('Registro de los endpoints de apoyo a pruebas', () => {
  describe('el controlador no existe fuera de NODE_ENV=test', () => {
    for (const nodeEnv of ['production', 'staging', 'development']) {
      it(`${nodeEnv} con el flag apagado no registra el controlador`, () => {
        const module = OnboardingModule.register(
          envFor(nodeEnv, { FEATURE_TEST_SUPPORT_ENDPOINTS: 'false' }),
        );

        expect(module.controllers).not.toContain(TestSupportController);
        expect(module.providers).not.toContain(TestNotificationSink);
      });
    }

    it('sin el flag definido tampoco lo registra', () => {
      const module = OnboardingModule.register(envFor('development'));

      expect(module.controllers).not.toContain(TestSupportController);
    });
  });

  describe('con NODE_ENV=test y el flag encendido', () => {
    it('el controlador queda registrado', () => {
      const module = OnboardingModule.register(
        envFor('test', { FEATURE_TEST_SUPPORT_ENDPOINTS: 'true' }),
      );

      expect(module.controllers).toContain(TestSupportController);
      expect(module.providers).toContain(TestNotificationSink);
    });

    it('el sumidero de notificaciones sólo acompaña a test-support', () => {
      const conFlag = OnboardingModule.register(
        envFor('test', { FEATURE_TEST_SUPPORT_ENDPOINTS: 'true' }),
      );
      const sinFlag = OnboardingModule.register(
        envFor('test', { FEATURE_TEST_SUPPORT_ENDPOINTS: 'false' }),
      );

      expect(conFlag.providers).toContain(TestNotificationSink);
      expect(sinFlag.providers).not.toContain(TestNotificationSink);
    });
  });

  describe('la condición de habilitación', () => {
    it('exige las dos cosas: entorno de test y flag encendido', () => {
      expect(
        isTestSupportEnabled({ NODE_ENV: 'test', FEATURE_TEST_SUPPORT_ENDPOINTS: 'true' }),
      ).toBe(true);
      expect(
        isTestSupportEnabled({ NODE_ENV: 'production', FEATURE_TEST_SUPPORT_ENDPOINTS: 'true' }),
      ).toBe(false);
      expect(
        isTestSupportEnabled({ NODE_ENV: 'test', FEATURE_TEST_SUPPORT_ENDPOINTS: 'false' }),
      ).toBe(false);
    });
  });
});

describe('El arranque rechaza combinaciones peligrosas', () => {
  it('production con el flag encendido no arranca', () => {
    expect(() =>
      loadAppConfig(
        envFor('production', {
          FEATURE_TEST_SUPPORT_ENDPOINTS: 'true',
          TEST_SUPPORT_SECRET: 'un-secreto-suficientemente-largo',
        }),
      ),
    ).toThrow(/producción/);
  });

  it('development con el flag encendido no arranca', () => {
    expect(() =>
      loadAppConfig(
        envFor('development', {
          FEATURE_TEST_SUPPORT_ENDPOINTS: 'true',
          TEST_SUPPORT_SECRET: 'un-secreto-suficientemente-largo',
        }),
      ),
    ).toThrow(/NODE_ENV=test/);
  });

  it('test con el flag encendido y sin secreto no arranca', () => {
    expect(() => loadAppConfig(envFor('test', { FEATURE_TEST_SUPPORT_ENDPOINTS: 'true' }))).toThrow(
      /TEST_SUPPORT_SECRET/,
    );
  });

  it('test con el flag encendido y un secreto demasiado corto no arranca', () => {
    expect(() =>
      loadAppConfig(
        envFor('test', { FEATURE_TEST_SUPPORT_ENDPOINTS: 'true', TEST_SUPPORT_SECRET: 'corto' }),
      ),
    ).toThrow();
  });

  it('test con el flag encendido y secreto válido arranca', () => {
    const config = loadAppConfig(
      envFor('test', {
        FEATURE_TEST_SUPPORT_ENDPOINTS: 'true',
        TEST_SUPPORT_SECRET: 'un-secreto-suficientemente-largo',
      }),
    );

    expect(config.FEATURE_TEST_SUPPORT_ENDPOINTS).toBe(true);
  });

  it('no hay secreto por defecto: con el flag apagado queda sin definir', () => {
    const config = loadAppConfig(envFor('production'));

    // Un default incrustado sería un secreto conocido por cualquiera que lea el
    // repositorio.
    expect(config.TEST_SUPPORT_SECRET).toBeUndefined();
  });
});
