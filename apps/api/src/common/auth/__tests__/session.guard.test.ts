import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { SessionGuard } from '../session.guard';
import type { AccessTokenService } from '../access-token.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { RedisSessionRevocationService } from '../../../modules/identity/redis-session-revocation.service';

/**
 * El escenario que motivó el cambio:
 *
 *   1. la persona cierra sesión y PostgreSQL marca `revokedAt`;
 *   2. Redis está caído, así que el marcador nunca se escribe;
 *   3. Redis vuelve, sin marcador;
 *   4. el access token todavía no venció.
 *
 * Con la denylist como única verificación, ese token seguía siendo aceptado.
 * Ahora la base es la fuente de verdad y el paso 4 no alcanza.
 */

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

const PAYLOAD = {
  sub: USER_ID,
  sid: SESSION_ID,
  roles: [],
  emp: null,
  wrk: null,
};

function makeContext(): ExecutionContext {
  const request = {
    cookies: {},
    get: (name: string) => (name === 'authorization' ? 'Bearer token-valido' : undefined),
    ip: '127.0.0.1',
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function makeGuard(options: {
  revocationState: 'REVOKED' | 'NOT_REVOKED' | 'UNKNOWN';
  session: { userId: string; revokedAt: Date | null; expiresAt: Date } | null;
}): SessionGuard {
  const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
  const accessTokens = { verify: () => PAYLOAD } as unknown as AccessTokenService;
  const revocation = {
    getRevocationState: vi.fn().mockResolvedValue(options.revocationState),
  } as unknown as RedisSessionRevocationService;
  const prisma = {
    session: { findUnique: vi.fn().mockResolvedValue(options.session) },
  } as unknown as PrismaService;

  return new SessionGuard(reflector, accessTokens, revocation, prisma);
}

const sesionActiva = {
  userId: USER_ID,
  revokedAt: null,
  expiresAt: new Date(Date.now() + 3_600_000),
};

describe('SessionGuard: PostgreSQL es la fuente de verdad', () => {
  it('deja pasar una sesión activa', async () => {
    const guard = makeGuard({ revocationState: 'NOT_REVOKED', session: sesionActiva });

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
  });

  it('rechaza de inmediato si Redis ya sabe que está revocada', async () => {
    const guard = makeGuard({ revocationState: 'REVOKED', session: sesionActiva });

    await expect(guard.canActivate(makeContext())).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza cuando Redis dice que no está revocada pero PostgreSQL sí', async () => {
    // Es el caso del logout con Redis caído: el marcador nunca se escribió.
    const guard = makeGuard({
      revocationState: 'NOT_REVOKED',
      session: { ...sesionActiva, revokedAt: new Date() },
    });

    await expect(guard.canActivate(makeContext())).rejects.toThrow(UnauthorizedException);
  });

  it('acepta una sesión válida aunque Redis no haya respondido', async () => {
    // Antes esto devolvía 401: una caída transitoria expulsaba a cualquiera.
    const guard = makeGuard({ revocationState: 'UNKNOWN', session: sesionActiva });

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
  });

  it('rechaza con Redis caído si la sesión está revocada en PostgreSQL', async () => {
    const guard = makeGuard({
      revocationState: 'UNKNOWN',
      session: { ...sesionActiva, revokedAt: new Date() },
    });

    await expect(guard.canActivate(makeContext())).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza una sesión vencida', async () => {
    const guard = makeGuard({
      revocationState: 'NOT_REVOKED',
      session: { ...sesionActiva, expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(guard.canActivate(makeContext())).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza una sesión que no existe en la base', async () => {
    const guard = makeGuard({ revocationState: 'NOT_REVOKED', session: null });

    await expect(guard.canActivate(makeContext())).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza una sesión que pertenece a otro usuario', async () => {
    const guard = makeGuard({
      revocationState: 'NOT_REVOKED',
      session: { ...sesionActiva, userId: '33333333-3333-4333-8333-333333333333' },
    });

    await expect(guard.canActivate(makeContext())).rejects.toThrow(UnauthorizedException);
  });
});
