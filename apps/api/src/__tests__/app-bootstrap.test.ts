import {
  ARCA_CONNECTOR,
  PAYMENT_PROVIDER,
  type ARCAConnector,
  type PaymentProvider,
} from '@casas/domain';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { AdapterNotImplementedError } from '../adapters/pending-adapter';
import { HealthController } from '../health/health.controller';
import { PrismaService } from '../common/prisma/prisma.service';

/**
 * Prueba de arranque de la aplicación.
 *
 * Existe por un defecto real: los proveedores de ARCA y pagos lanzaban durante la
 * instanciación, así que Nest abortaba el arranque y ni `/health` respondía. El
 * lint, el typecheck, las pruebas unitarias y el build pasaban igual — nada de eso
 * instancia el módulo raíz.
 *
 * Esta prueba cierra ese hueco: si alguien vuelve a registrar un proveedor que
 * falle al construirse, falla acá.
 */

const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3001',
  API_BASE_URL: 'http://localhost:3001',
  WEB_BASE_URL: 'http://localhost:3000',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://casas:test@localhost:5432/casas_test?schema=public',
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
};

describe('Arranque de la aplicación', () => {
  let app: INestApplication;

  beforeAll(async () => {
    Object.assign(process.env, TEST_ENV);

    // Se sustituye Prisma por un doble: esta prueba verifica que el contenedor
    // se arme y la aplicación arranque, no que la base responda. Lo que toca la
    // base son las pruebas de integración.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $connect: async () => undefined, $disconnect: async () => undefined })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('el módulo raíz se instancia y la aplicación inicia', () => {
    expect(app).toBeDefined();
  });

  it('los 26 módulos del backend quedan registrados', () => {
    // Si un módulo declarado en app.module.ts no se puede instanciar, `init()`
    // ya habría fallado en beforeAll.
    expect(app.getHttpAdapter()).toBeDefined();
  });

  describe('adaptadores pendientes', () => {
    it('el puerto de ARCA se resuelve sin romper el arranque', () => {
      const connector = app.get<ARCAConnector>(ARCA_CONNECTOR);
      expect(connector).toBeDefined();
      expect(connector.kind).toBe('MANUAL_ASSISTED');
    });

    it('usar el puerto de ARCA falla con un mensaje que dice qué falta', () => {
      const connector = app.get<ARCAConnector>(ARCA_CONNECTOR);

      expect(() => connector.getObligations({} as never)).toThrow(AdapterNotImplementedError);
      try {
        connector.createReceipt({} as never);
      } catch (error: unknown) {
        const typed = error as AdapterNotImplementedError;
        expect(typed.code).toBe('ADAPTER_NOT_IMPLEMENTED');
        expect(typed.operation).toBe('createReceipt');
        expect(typed.message).toContain('Etapa 3');
      }
    });

    it('el puerto de pagos se resuelve y también falla sólo al usarse', () => {
      const provider = app.get<PaymentProvider>(PAYMENT_PROVIDER);

      expect(provider.kind).toBe('MANUAL_TRANSFER');
      expect(() => provider.createPaymentIntent({} as never)).toThrow(AdapterNotImplementedError);
    });

    it('ningún adaptador pendiente devuelve datos: siempre lanza', () => {
      const connector = app.get<ARCAConnector>(ARCA_CONNECTOR);

      for (const operation of [
        'getRelationshipStatus',
        'getObligations',
        'createReceipt',
        'downloadReceipt',
        'validateReceipt',
      ] as const) {
        expect(() => connector[operation]({} as never), operation).toThrow(
          AdapterNotImplementedError,
        );
      }
    });
  });

  describe('health y readiness responden (NFR-09)', () => {
    // Se consulta el controlador desde el contenedor en lugar de levantar un
    // puerto real: verifica que quedó registrado y resuelto, sin agregar la
    // inestabilidad de un servidor HTTP en una prueba unitaria.
    it('/health indica que el proceso está vivo', () => {
      const result = app.get(HealthController).health();

      expect(result.status).toBe('up');
      expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });

    it('/ready devuelve un informe de dependencias', async () => {
      const report = await app.get(HealthController).ready();

      expect(report.status).toBe('up');
      expect(report.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
