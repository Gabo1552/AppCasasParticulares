import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { RedisSessionRevocationService } from '../redis-session-revocation.service';
import type { AppConfig } from '../../../config/app-config';

describe('RedisSessionRevocationService', () => {
  const config = {
    REDIS_URL: 'redis://localhost:6379',
  } as AppConfig;

  it('detecta revocación correctamente cuando la clave existe', async () => {
    const service = new RedisSessionRevocationService(config);
    // Mock internal Redis client
    const mockGet = vi.fn().mockResolvedValue('1');
    (service as unknown as { client: { get: typeof mockGet; status: string } }).client = {
      get: mockGet,
      status: 'ready',
    };

    const isRevoked = await service.isSessionRevoked('session-123');
    expect(isRevoked).toBe(true);
    expect(mockGet).toHaveBeenCalledWith('revoked_session:session-123');
  });

  it('devuelve false cuando la clave no existe', async () => {
    const service = new RedisSessionRevocationService(config);
    const mockGet = vi.fn().mockResolvedValue(null);
    (service as unknown as { client: { get: typeof mockGet; status: string } }).client = {
      get: mockGet,
      status: 'ready',
    };

    const isRevoked = await service.isSessionRevoked('session-active');
    expect(isRevoked).toBe(false);
  });

  it('aplica estrategia fail-closed (UnauthorizedException) si Redis falla', async () => {
    const service = new RedisSessionRevocationService(config);
    (
      service as unknown as {
        client: { get: () => Promise<never>; connect: () => Promise<void>; status: string };
      }
    ).client = {
      connect: vi.fn().mockRejectedValue(new Error('Redis connection refused')),
      get: vi.fn().mockRejectedValue(new Error('Redis connection refused')),
      status: 'connecting',
    };

    await expect(service.isSessionRevoked('session-123')).rejects.toThrow(UnauthorizedException);
  });
});
