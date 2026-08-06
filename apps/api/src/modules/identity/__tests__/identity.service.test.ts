import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../../../common/audit/audit.service';
import { AccessTokenService } from '../../../common/auth/access-token.service';
import { TokenService } from '../../../common/crypto/token.service';
import { TooManyRequestsError, UnprocessableError } from '../../../common/http/app.errors';
import type { AppConfig } from '../../../config/app-config';
import { FakePrisma } from '../../../__tests__/support/fake-prisma';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { NotificationsService } from '../../notifications/notifications.service';
import { IdentityService, OTP_MAX_ATTEMPTS, OTP_REQUESTS_PER_WINDOW } from '../identity.service';

const EMAIL = 'ana@example.test';

const config = {
  NODE_ENV: 'test',
  FIELD_ENCRYPTION_KEY: 'clave-de-prueba-de-32-caracteres!!',
  JWT_ACCESS_SECRET: 'secreto-de-prueba-de-32-caracteres!',
} as unknown as AppConfig;

/**
 * Captura el código que se envió por correo.
 *
 * Es la única forma de conocerlo en la prueba: el servicio guarda sólo el HMAC,
 * exactamente como en producción. Si alguien cambiara el servicio para persistir
 * el código en claro, esta prueba seguiría pasando, pero la de integración que
 * revisa la fila de `OneTimeCode` no.
 */
function buildService(): {
  identity: IdentityService;
  prisma: FakePrisma;
  sentCodes: string[];
} {
  const prisma = new FakePrisma();
  const sentCodes: string[] = [];
  const tokens = new TokenService(config);
  const notifications = {
    sendAccessCode: vi.fn((_to: string, code: string) => {
      sentCodes.push(code);
      return Promise.resolve();
    }),
  } as unknown as NotificationsService;

  const identity = new IdentityService(
    prisma as unknown as PrismaService,
    tokens,
    new AccessTokenService(new JwtService({}), config),
    new AuditService(),
    notifications,
    config,
  );

  return { identity, prisma, sentCodes };
}

describe('IdentityService — código de acceso de un solo uso', () => {
  let fixture: ReturnType<typeof buildService>;

  beforeEach(() => {
    vi.useRealTimers();
    fixture = buildService();
  });

  it('no persiste el código en claro: sólo su HMAC', async () => {
    const { identity, prisma, sentCodes } = fixture;
    await identity.requestCode(EMAIL, {});

    const code = sentCodes[0];
    expect(code).toMatch(/^\d{6}$/);

    const stored = prisma.oneTimeCode.rows[0];
    expect(stored).toBeDefined();
    expect(JSON.stringify(stored)).not.toContain(code as string);
    expect(String(stored?.['codeHash'])).toHaveLength(64);
  });

  it('liga el hash al destino: el mismo código no sirve para otro correo', () => {
    const tokens = new TokenService(config);
    const hash = tokens.hashOtpCode('123456', EMAIL);

    expect(tokens.verifyOtpCode('123456', EMAIL, hash)).toBe(true);
    expect(tokens.verifyOtpCode('123456', 'otra@example.test', hash)).toBe(false);
  });

  it('abre sesión con el código correcto y da de alta al usuario en el primer ingreso', async () => {
    const { identity, prisma, sentCodes } = fixture;
    await identity.requestCode(EMAIL, {});

    const session = await identity.verifyCode(EMAIL, sentCodes[0] as string, {});

    expect(session.accessToken.split('.')).toHaveLength(3);
    expect(session.refreshToken.length).toBeGreaterThan(30);
    expect(prisma.user.rows).toHaveLength(1);
    expect(prisma.user.rows[0]?.['email']).toBe(EMAIL);
    // El alta no otorga ningún rol: eso lo hace completar un perfil.
    expect(prisma.user.rows[0]?.['roles']).toEqual([]);
  });

  it('invalida el código anterior cuando se pide uno nuevo', async () => {
    const { identity, sentCodes } = fixture;
    await identity.requestCode(EMAIL, {});
    await identity.requestCode(EMAIL, {});

    await expect(identity.verifyCode(EMAIL, sentCodes[0] as string, {})).rejects.toThrow(
      UnprocessableError,
    );
    await expect(identity.verifyCode(EMAIL, sentCodes[1] as string, {})).resolves.toBeDefined();
  });

  it('rechaza el código vencido', async () => {
    const { identity, prisma, sentCodes } = fixture;
    await identity.requestCode(EMAIL, {});

    // Se envejece la fila en lugar de esperar diez minutos.
    const row = prisma.oneTimeCode.rows[0] as Record<string, unknown>;
    row['expiresAt'] = new Date(Date.now() - 1_000);

    await expect(identity.verifyCode(EMAIL, sentCodes[0] as string, {})).rejects.toThrow(
      /no es válido o venció/,
    );
  });

  it('corta después de los intentos permitidos y quema el código', async () => {
    const { identity, prisma, sentCodes } = fixture;
    await identity.requestCode(EMAIL, {});
    const correct = sentCodes[0] as string;
    const wrong = correct === '000000' ? '111111' : '000000';

    for (let attempt = 0; attempt < OTP_MAX_ATTEMPTS; attempt += 1) {
      await expect(identity.verifyCode(EMAIL, wrong, {})).rejects.toThrow(UnprocessableError);
    }

    // El intento siguiente ya no evalúa el código: corta por límite.
    await expect(identity.verifyCode(EMAIL, correct, {})).rejects.toThrow(TooManyRequestsError);
    // Y el código queda consumido, así que ni siquiera pedir de nuevo lo revive.
    expect(prisma.oneTimeCode.rows[0]?.['consumedAt']).not.toBeNull();
  });

  it('limita la cantidad de códigos por ventana', async () => {
    const { identity } = fixture;
    for (let request = 0; request < OTP_REQUESTS_PER_WINDOW; request += 1) {
      await identity.requestCode(EMAIL, {});
    }
    await expect(identity.requestCode(EMAIL, {})).rejects.toThrow(TooManyRequestsError);
  });

  it('responde igual exista o no el correo (no permite enumerar usuarios)', async () => {
    const { identity, prisma } = fixture;
    await identity.requestCode('conocida@example.test', {});
    await identity.verifyCode('conocida@example.test', '000000', {}).catch(() => undefined);

    const forKnown = await identity.requestCode('conocida@example.test', {}).then(
      () => 'ok',
      (error: Error) => error.message,
    );
    const forUnknown = await identity.requestCode('nueva@example.test', {}).then(
      () => 'ok',
      (error: Error) => error.message,
    );

    expect(forKnown).toBe('ok');
    expect(forUnknown).toBe('ok');
    // Ambos correos dejan una fila indistinguible desde afuera.
    expect(prisma.oneTimeCode.rows.filter((r) => r['destination'] === 'nueva@example.test')).toHaveLength(
      1,
    );
  });

  it('audita el pedido de código sin guardar el código', async () => {
    const { identity, prisma, sentCodes } = fixture;
    await identity.requestCode(EMAIL, {});

    expect(prisma.auditActions()).toContain('ACCESS_CODE_REQUESTED');
    expect(JSON.stringify(prisma.auditEvent.rows)).not.toContain(sentCodes[0] as string);
  });
});

describe('IdentityService — rotación de refresh tokens', () => {
  let fixture: ReturnType<typeof buildService>;

  beforeEach(async () => {
    fixture = buildService();
    await fixture.identity.requestCode(EMAIL, {});
  });

  async function login(): Promise<{ refreshToken: string; sessionId: string; userId: string }> {
    const code = fixture.sentCodes.at(-1) as string;
    const session = await fixture.identity.verifyCode(EMAIL, code, {});
    return session;
  }

  it('entrega un refresh token nuevo y revoca el anterior', async () => {
    const first = await login();
    const second = await fixture.identity.refresh(first.refreshToken, {});

    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.sessionId).not.toBe(first.sessionId);

    const revoked = fixture.prisma.session.rows.find((row) => row['id'] === first.sessionId);
    expect(revoked?.['revokedReason']).toBe('ROTATED');
  });

  it('mantiene la misma familia de tokens a través de las rotaciones', async () => {
    const first = await login();
    const second = await fixture.identity.refresh(first.refreshToken, {});
    const third = await fixture.identity.refresh(second.refreshToken, {});

    const families = new Set(fixture.prisma.session.rows.map((row) => row['tokenFamilyId']));
    expect(families.size).toBe(1);
    expect(third.sessionId).not.toBe(second.sessionId);
  });

  it('reutilizar un refresh token ya rotado invalida toda la familia', async () => {
    const first = await login();
    const second = await fixture.identity.refresh(first.refreshToken, {});

    // El atacante reutiliza el token viejo.
    await expect(fixture.identity.refresh(first.refreshToken, {})).rejects.toThrow(
      /uso indebido/,
    );

    // La sesión legítima también cae: es el precio de no dejar conviviendo a las dos.
    await expect(fixture.identity.refresh(second.refreshToken, {})).rejects.toThrow(
      /uso indebido/,
    );
    expect(fixture.prisma.auditActions()).toContain('SESSION_REUSE_DETECTED');
  });

  it('rechaza un refresh token desconocido sin revelar por qué', async () => {
    await expect(fixture.identity.refresh('token-inventado', {})).rejects.toThrow(
      /no es válida/,
    );
  });

  it('rechaza un refresh token vencido', async () => {
    const first = await login();
    const row = fixture.prisma.session.rows.find((r) => r['id'] === first.sessionId) as Record<
      string,
      unknown
    >;
    row['expiresAt'] = new Date(Date.now() - 1_000);

    await expect(fixture.identity.refresh(first.refreshToken, {})).rejects.toThrow(/venció/);
  });

  it('cerrar sesión revoca sólo la sesión indicada', async () => {
    const first = await login();
    await fixture.identity.logout(first.sessionId, first.userId, {});

    const row = fixture.prisma.session.rows.find((r) => r['id'] === first.sessionId);
    expect(row?.['revokedReason']).toBe('USER_LOGOUT');
    expect(fixture.prisma.auditActions()).toContain('SESSION_REVOKED');
  });

  it('no guarda el refresh token en claro', async () => {
    const first = await login();
    const row = fixture.prisma.session.rows.find((r) => r['id'] === first.sessionId);

    expect(JSON.stringify(row)).not.toContain(first.refreshToken);
    expect(String(row?.['refreshTokenHash'])).toHaveLength(64);
  });
});
