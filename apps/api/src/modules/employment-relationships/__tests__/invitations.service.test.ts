import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../../../common/audit/audit.service';
import { TokenService } from '../../../common/crypto/token.service';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../common/http/app.errors';
import type { AuthenticatedActor } from '../../../common/auth/auth.types';
import type { AppConfig } from '../../../config/app-config';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import { FakePrisma } from '../../../__tests__/support/fake-prisma';
import type { EmployersService } from '../../employers/employers.service';
import type { HouseholdsService } from '../../households/households.service';
import type { WorkersService } from '../../workers/workers.service';
import type { NotificationsService } from '../../notifications/notifications.service';
import { InvitationsService } from '../invitations.service';

const config = {
  FIELD_ENCRYPTION_KEY: 'clave-de-prueba-de-32-caracteres!!',
  WEB_BASE_URL: 'http://localhost:3000',
} as unknown as AppConfig;

const WORKER_EMAIL = 'trabajadora@example.test';
const HOUSEHOLD_ID = 'household-1';

const familyActor: AuthenticatedActor = {
  userId: 'user-familia',
  sessionId: 'sesion-familia',
  roles: ['FAMILY_EMPLOYER'],
  employerId: 'employer-1',
  workerId: null,
} as unknown as AuthenticatedActor;

const workerActor: AuthenticatedActor = {
  userId: 'user-trabajadora',
  sessionId: 'sesion-trabajadora',
  roles: ['WORKER'],
  employerId: null,
  workerId: 'worker-1',
} as unknown as AuthenticatedActor;

/**
 * Enlaces que salieron por correo.
 *
 * Es la única fuente del token en claro, igual que en producción: la base guarda
 * el SHA-256 y nada más.
 */
function buildService() {
  const prisma = new FakePrisma();
  const sentLinks: string[] = [];

  const notifications = {
    sendWorkerInvitation: vi.fn((input: { acceptUrl: string }) => {
      sentLinks.push(input.acceptUrl);
      return Promise.resolve();
    }),
    sendInvitationRevoked: vi.fn(() => Promise.resolve()),
    sendInvitationAccepted: vi.fn(() => Promise.resolve()),
  } as unknown as NotificationsService;

  const employers = {
    requireEmployerId: vi.fn(() => Promise.resolve('employer-1')),
    get: vi.fn(() => Promise.resolve({ firstName: 'Ana', lastName: 'Gómez' })),
  } as unknown as EmployersService;

  const households = {
    findOwnedOrFail: vi.fn((_actor: unknown, id: string) =>
      Promise.resolve({ id, label: 'Casa de Palermo', city: 'CABA' }),
    ),
  } as unknown as HouseholdsService;

  const workers = {
    requireWorkerId: vi.fn(() => Promise.resolve('worker-1')),
    get: vi.fn(() => Promise.resolve({ firstName: 'Rosa', lastName: 'Díaz' })),
  } as unknown as WorkersService;

  const invitations = new InvitationsService(
    prisma as unknown as PrismaService,
    new TokenService(config),
    new AuditService(),
    employers,
    households,
    workers,
    notifications,
    config,
  );

  // La trabajadora existe y su correo coincide con el invitado.
  void prisma.user.create({
    data: { id: workerActor.userId, email: WORKER_EMAIL },
  });

  return { invitations, prisma, sentLinks, notifications };
}

/** Extrae el token del enlace `/invitacion/<token>`. */
function tokenOf(link: string): string {
  return link.split('/').at(-1) as string;
}

describe('InvitationsService — enlace de invitación', () => {
  let fixture: ReturnType<typeof buildService>;

  beforeEach(() => {
    fixture = buildService();
  });

  async function invite(): Promise<string> {
    await fixture.invitations.create(familyActor, {
      householdId: HOUSEHOLD_ID,
      workerEmail: WORKER_EMAIL,
      expiresInDays: 7,
    });
    return tokenOf(fixture.sentLinks.at(-1) as string);
  }

  it('guarda sólo el hash del token, nunca el token', async () => {
    const token = await invite();
    const row = fixture.prisma.workerInvitation.rows[0];

    expect(JSON.stringify(row)).not.toContain(token);
    expect(String(row?.['tokenHash'])).toHaveLength(64);
  });

  it('no audita el token', async () => {
    const token = await invite();
    expect(fixture.prisma.auditActions()).toContain('INVITATION_CREATED');
    expect(JSON.stringify(fixture.prisma.auditEvent.rows)).not.toContain(token);
  });

  it('resuelve el enlace mostrando quién invita y a qué domicilio', async () => {
    const token = await invite();
    const resolved = await fixture.invitations.resolveByToken(token);

    expect(resolved.employerName).toBe('Ana Gómez');
    expect(resolved.householdLabel).toBe('Casa de Palermo');
    expect(resolved.status).toBe('PENDING');
    // No se filtra la dirección exacta ni el id del empleador.
    expect(Object.keys(resolved)).not.toContain('employerId');
  });

  it('rechaza un token inventado', async () => {
    await expect(fixture.invitations.resolveByToken('token-falso')).rejects.toThrow(NotFoundError);
  });

  it('no crea una relación laboral al invitar', async () => {
    await invite();
    expect(fixture.prisma.employmentRelationship.rows).toHaveLength(0);
    expect(fixture.prisma.workerInvitation.rows[0]?.['status']).toBe('PENDING');
  });

  it('rechaza una segunda invitación pendiente al mismo correo y domicilio', async () => {
    await invite();
    await expect(
      fixture.invitations.create(familyActor, {
        householdId: HOUSEHOLD_ID,
        workerEmail: WORKER_EMAIL,
        expiresInDays: 7,
      }),
    ).rejects.toThrow(ConflictError);
  });
});

describe('InvitationsService — aceptación', () => {
  let fixture: ReturnType<typeof buildService>;

  beforeEach(() => {
    fixture = buildService();
  });

  async function invite(): Promise<string> {
    await fixture.invitations.create(familyActor, {
      householdId: HOUSEHOLD_ID,
      workerEmail: WORKER_EMAIL,
      expiresInDays: 7,
    });
    return tokenOf(fixture.sentLinks.at(-1) as string);
  }

  it('crea la relación en PENDING_CONFIGURATION, nunca activa (ADR 0002)', async () => {
    const token = await invite();
    const { relationshipId } = await fixture.invitations.accept(workerActor, token);

    const relationship = fixture.prisma.employmentRelationship.rows.find(
      (row) => row['id'] === relationshipId,
    );
    expect(relationship?.['status']).toBe('PENDING_CONFIGURATION');
    expect(relationship?.['status']).not.toBe('ACTIVE');
  });

  it('el mismo enlace no se puede usar dos veces', async () => {
    const token = await invite();
    await fixture.invitations.accept(workerActor, token);

    await expect(fixture.invitations.accept(workerActor, token)).rejects.toThrow(
      /ya fue utilizada/,
    );
  });

  it('no se puede rechazar una invitación ya aceptada', async () => {
    const token = await invite();
    await fixture.invitations.accept(workerActor, token);

    await expect(fixture.invitations.reject(workerActor, token)).rejects.toThrow(
      /ya fue utilizada/,
    );
  });

  it('una invitación vencida falla de forma explícita y queda marcada EXPIRED', async () => {
    const token = await invite();
    const row = fixture.prisma.workerInvitation.rows[0] as Record<string, unknown>;
    row['expiresAt'] = new Date(Date.now() - 1_000);

    await expect(fixture.invitations.accept(workerActor, token)).rejects.toThrow(/venció/);
    expect(row['status']).toBe('EXPIRED');
  });

  it('una invitación dada de baja no se puede aceptar', async () => {
    const token = await invite();
    const invitationId = String(fixture.prisma.workerInvitation.rows[0]?.['id']);
    await fixture.invitations.revoke(familyActor, invitationId, 'Ya se cubrió el puesto');

    await expect(fixture.invitations.accept(workerActor, token)).rejects.toThrow(/dada de baja/);
  });

  it('el token identifica pero no autoriza: otro correo no puede aceptar', async () => {
    const token = await invite();
    await fixture.prisma.user.create({
      data: { id: 'user-intrusa', email: 'intrusa@example.test' },
    });

    const intruder = { ...workerActor, userId: 'user-intrusa' } as AuthenticatedActor;
    await expect(fixture.invitations.accept(intruder, token)).rejects.toThrow(ForbiddenError);
    expect(fixture.prisma.employmentRelationship.rows).toHaveLength(0);
  });

  it('reenviar emite un token nuevo e invalida el anterior', async () => {
    const original = await invite();
    const invitationId = String(fixture.prisma.workerInvitation.rows[0]?.['id']);

    await fixture.invitations.resend(familyActor, invitationId);
    const renewed = tokenOf(fixture.sentLinks.at(-1) as string);

    expect(renewed).not.toBe(original);
    await expect(fixture.invitations.resolveByToken(original)).rejects.toThrow(NotFoundError);
    await expect(fixture.invitations.resolveByToken(renewed)).resolves.toMatchObject({
      status: 'PENDING',
    });
  });

  it('no se puede dar de baja una invitación que ya no está pendiente', async () => {
    const token = await invite();
    const invitationId = String(fixture.prisma.workerInvitation.rows[0]?.['id']);
    await fixture.invitations.accept(workerActor, token);

    await expect(fixture.invitations.revoke(familyActor, invitationId)).rejects.toThrow(
      /pendiente/,
    );
  });

  it('rechazar deja la invitación cerrada y audita el motivo', async () => {
    const token = await invite();
    await fixture.invitations.reject(workerActor, token, 'No me queda cerca');

    expect(fixture.prisma.workerInvitation.rows[0]?.['status']).toBe('REJECTED');
    expect(fixture.prisma.auditActions()).toContain('INVITATION_REJECTED');
    expect(fixture.prisma.employmentRelationship.rows).toHaveLength(0);
  });
});
