import { describe, expect, it, vi } from 'vitest';
import { RedisSessionRevocationService } from '../redis-session-revocation.service';
import type { AppConfig } from '../../../config/app-config';

/**
 * La denylist de Redis dejó de ser la fuente de verdad.
 *
 * Antes `isSessionRevoked` lanzaba 401 cuando Redis fallaba: una caída transitoria
 * expulsaba a personas con sesión perfectamente válida. Y en el otro sentido,
 * `revokeSession` se tragaba el error de Redis, así que un logout durante una
 * caída se reportaba como exitoso y el access token seguía sirviendo.
 *
 * Ahora la consulta devuelve `UNKNOWN` y decide PostgreSQL (ver session.guard).
 */

const config = { REDIS_URL: 'redis://localhost:6379' } as AppConfig;

function withClient(client: Record<string, unknown>): RedisSessionRevocationService {
  const service = new RedisSessionRevocationService(config);
  (service as unknown as { client: unknown }).client = client;
  return service;
}

describe('RedisSessionRevocationService', () => {
  describe('consulta de la denylist', () => {
    it('devuelve REVOKED cuando el marcador existe', async () => {
      const get = vi.fn().mockResolvedValue('1');
      const service = withClient({ get, status: 'ready' });

      await expect(service.getRevocationState('session-123')).resolves.toBe('REVOKED');
      expect(get).toHaveBeenCalledWith('revoked_session:session-123');
    });

    it('devuelve NOT_REVOKED cuando no hay marcador', async () => {
      const service = withClient({ get: vi.fn().mockResolvedValue(null), status: 'ready' });

      await expect(service.getRevocationState('session-activa')).resolves.toBe('NOT_REVOKED');
    });

    it('devuelve UNKNOWN si Redis no responde, sin lanzar', async () => {
      const service = withClient({
        connect: vi.fn().mockRejectedValue(new Error('connection refused')),
        get: vi.fn().mockRejectedValue(new Error('connection refused')),
        status: 'connecting',
      });

      // No lanza: que Redis esté caído no puede decidir el acceso por sí solo.
      await expect(service.getRevocationState('session-123')).resolves.toBe('UNKNOWN');
    });
  });

  describe('registro de la revocación', () => {
    it('informa true cuando Redis acepta el marcador', async () => {
      const exec = vi.fn().mockResolvedValue([[null, 'OK']]);
      const service = withClient({
        pipeline: () => ({ set: vi.fn(), exec }),
        status: 'ready',
      });

      await expect(service.revokeSession('session-123')).resolves.toBe(true);
    });

    it('informa false cuando Redis falla, en vez de simular éxito', async () => {
      const service = withClient({
        pipeline: () => ({
          set: vi.fn(),
          exec: vi.fn().mockRejectedValue(new Error('connection refused')),
        }),
        connect: vi.fn().mockRejectedValue(new Error('connection refused')),
        status: 'connecting',
      });

      await expect(service.revokeSession('session-123')).resolves.toBe(false);
    });

    it('informa false si alguna clave del lote falló', async () => {
      const exec = vi.fn().mockResolvedValue([
        [null, 'OK'],
        [new Error('falló'), null],
      ]);
      const service = withClient({ pipeline: () => ({ set: vi.fn(), exec }), status: 'ready' });

      await expect(service.revokeSessions(['a', 'b'])).resolves.toBe(false);
    });

    it('un lote vacío es un no-op exitoso', async () => {
      const service = withClient({ status: 'ready' });

      await expect(service.revokeSessions([])).resolves.toBe(true);
    });
  });

  describe('ping para el readiness', () => {
    it('lanza cuando Redis no responde', async () => {
      const service = withClient({
        connect: vi.fn().mockRejectedValue(new Error('connection refused')),
        ping: vi.fn(),
        // `end` fuerza el intento de conexión; con `connecting` se lo daría por
        // bueno sin comprobar nada.
        status: 'end',
      });

      await expect(service.ping()).rejects.toThrow();
    });

    it('resuelve cuando Redis responde', async () => {
      const service = withClient({ ping: vi.fn().mockResolvedValue('PONG'), status: 'ready' });

      await expect(service.ping()).resolves.toBeUndefined();
    });
  });
});
