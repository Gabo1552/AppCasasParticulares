import { PrismaClient } from '@casas/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import {
  ApiClient,
  VALID_CONDITIONS,
  VALID_HOUSEHOLD,
  VALID_PROFILE,
  VALID_SCHEDULE,
  bootTestApp,
  uniqueEmail,
} from './support/onboarding-client';

/**
 * Recorrido completo de onboarding contra PostgreSQL real (Etapa 3, pasos 1 a 6).
 *
 * Levanta la aplicación real y ejecuta los mismos endpoints que usa la web. Lo
 * que se verifica acá no se puede verificar en una prueba unitaria: el efecto
 * real sobre la base, la auditoría escrita en la misma transacción, el tipo
 * decimal de la remuneración y el aislamiento entre familias distintas.
 */

const prisma = new PrismaClient();
let app: INestApplication;

beforeAll(async () => {
  await prisma.$connect();
  app = await bootTestApp();
}, 60_000);

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

/** Ejecuta el recorrido entero y devuelve todo lo creado. */
async function runFullFlow(): Promise<{
  family: ApiClient;
  worker: ApiClient;
  familyEmail: string;
  workerEmail: string;
  householdId: string;
  invitationId: string;
  relationshipId: string;
}> {
  const familyEmail = uniqueEmail('familia');
  const workerEmail = uniqueEmail('trabajadora');

  // 1. La familia se registra.
  const family = new ApiClient(app);
  await family.login(familyEmail);

  // 2. Crea su perfil de empleador.
  await family.createProfile('employer', VALID_PROFILE);

  // 3. Crea un domicilio de trabajo.
  const householdResponse = await family.post('/households', VALID_HOUSEHOLD).expect(201);
  const householdId = (householdResponse.body as { id: string }).id;

  // 4. Invita a una trabajadora.
  const invitationResponse = await family
    .post('/worker-invitations', { householdId, workerEmail })
    .expect(201);
  const invitationId = (invitationResponse.body as { id: string }).id;

  // 5. La trabajadora ingresa, crea su perfil y acepta la invitación.
  const worker = new ApiClient(app);
  await worker.login(workerEmail);
  await worker.createProfile('worker', { ...VALID_PROFILE, firstName: 'Rosa' });

  const token = await worker.invitationToken(workerEmail);
  const acceptResponse = await worker.post('/worker-invitations/accept', { token }).expect(201);
  const relationshipId = (acceptResponse.body as { relationshipId: string }).relationshipId;

  // 6. La familia configura condiciones y calendario, y las envía.
  await family.patch(`/employment-relationships/${relationshipId}/conditions`, VALID_CONDITIONS);
  await family.put(`/employment-relationships/${relationshipId}/work-schedule`, VALID_SCHEDULE);

  return {
    family,
    worker,
    familyEmail,
    workerEmail,
    householdId,
    invitationId,
    relationshipId,
  };
}

describe('Recorrido completo de la familia y la trabajadora', () => {
  let flow: Awaited<ReturnType<typeof runFullFlow>>;

  beforeAll(async () => {
    flow = await runFullFlow();
  }, 120_000);

  it('el alta no otorga ningún rol hasta que se crea un perfil', async () => {
    const sinPerfil = new ApiClient(app);
    await sinPerfil.login(uniqueEmail('sin-perfil'));

    const me = await sinPerfil.get('/auth/me').expect(200);
    expect((me.body as { roles: string[] }).roles).toEqual([]);
  });

  it('crear el perfil otorga el rol FAMILY_EMPLOYER', async () => {
    const me = await flow.family.get('/auth/me').expect(200);
    const body = me.body as { roles: string[]; employer: { firstName: string } | null };

    expect(body.roles).toContain('FAMILY_EMPLOYER');
    expect(body.employer?.firstName).toBe('Ana');
  });

  it('registra la versión de los consentimientos aceptados', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: flow.familyEmail } });
    const consents = await prisma.consent.findMany({
      where: { userId: user.id },
      include: { document: true },
    });

    expect(consents).toHaveLength(2);
    // Se guarda el puntero al texto exacto que la persona vio, con su versión.
    expect(consents.map((c) => c.purpose).sort()).toEqual(['PRIVACY_POLICY', 'TERMS_OF_SERVICE']);
    for (const consent of consents) {
      expect(consent.document.version).toBe('1.0');
      expect(consent.document.body.length).toBeGreaterThan(100);
    }
  });

  it('no guarda clave fiscal, CUIL ni datos bancarios del perfil', async () => {
    const employer = await prisma.employer.findFirstOrThrow({
      where: { user: { email: flow.familyEmail } },
    });

    // El alta no pide CUIL ni documentación, así que los campos quedan vacíos.
    expect(employer.cuilCipher).toBeNull();
    expect(employer.cuilLast4).toBeNull();

    const serialized = JSON.stringify(employer);
    expect(serialized).not.toMatch(/claveFiscal|cbu|cvu/i);
  });

  it('el domicilio queda activo y con el país fijo en AR', async () => {
    const response = await flow.family.get(`/households/${flow.householdId}`).expect(200);
    const household = response.body as { country: string; isActive: boolean; city: string };

    expect(household.country).toBe('AR');
    expect(household.isActive).toBe(true);
    expect(household.city).toBe('CABA');
  });

  it('no persiste coordenadas del domicilio en este sprint', async () => {
    const household = await prisma.household.findUniqueOrThrow({
      where: { id: flow.householdId },
    });
    // Los campos existen para el fichaje por proximidad de la Etapa 6, pero el
    // alta de domicilio de este sprint no los pide ni los completa.
    expect(household.geoLat).toBeNull();
    expect(household.geoLng).toBeNull();
    expect(household.geoRadiusMeters).toBeNull();
  });

  it('la invitación no crea por sí sola una relación activa', async () => {
    const invitation = await prisma.workerInvitation.findUniqueOrThrow({
      where: { id: flow.invitationId },
    });
    expect(invitation.status).toBe('ACCEPTED');

    const relationship = await prisma.employmentRelationship.findUniqueOrThrow({
      where: { id: flow.relationshipId },
    });
    // Aceptar la invitación deja la relación esperando condiciones, no activa.
    expect(relationship.status).not.toBe('ACTIVE');
  });

  it('no almacena el token de invitación en claro', async () => {
    const invitation = await prisma.workerInvitation.findUniqueOrThrow({
      where: { id: flow.invitationId },
    });
    expect(invitation.tokenHash).toHaveLength(64);
    expect(invitation.tokenHash).toMatch(/^[0-9a-f]+$/);
  });

  it('persiste la remuneración como decimal exacto, no como float', async () => {
    const terms = await prisma.relationshipTerms.findFirstOrThrow({
      where: { employmentRelationshipId: flow.relationshipId, effectiveTo: null },
    });

    // 350000.00 sobrevive intacto: con float el valor volvería con ruido binario.
    expect(terms.agreedRemuneration.toFixed(2)).toBe('350000.00');
    expect(terms.currency).toBe('ARS');
  });

  it('devuelve la remuneración como string decimal en el JSON (RN-13)', async () => {
    const response = await flow.family
      .get(`/employment-relationships/${flow.relationshipId}`)
      .expect(200);
    const body = response.body as { conditions: { agreedRemuneration: unknown } | null };

    expect(typeof body.conditions?.agreedRemuneration).toBe('string');
    expect(body.conditions?.agreedRemuneration).toBe('350000.00');
  });

  it('guarda el calendario semanal con los tres bloques configurados', async () => {
    const response = await flow.family
      .get(`/employment-relationships/${flow.relationshipId}/work-schedule`)
      .expect(200);
    const schedule = response.body as { days: unknown[]; weeklyMinutes: number };

    expect(schedule.days).toHaveLength(3);
    // (6 h − 30 min) × 3 días = 990 minutos.
    expect(schedule.weeklyMinutes).toBe(990);
  });

  it('la trabajadora puede ver el calendario de su relación', async () => {
    const response = await flow.worker
      .get(`/employment-relationships/${flow.relationshipId}/work-schedule`)
      .expect(200);
    expect((response.body as { days: unknown[] }).days).toHaveLength(3);
  });
});

describe('Activación: sólo la trabajadora puede aceptar (ADR 0002)', () => {
  let flow: Awaited<ReturnType<typeof runFullFlow>>;

  beforeAll(async () => {
    flow = await runFullFlow();
  }, 120_000);

  it('la familia envía las condiciones y la relación queda esperando a la trabajadora', async () => {
    const response = await flow.family
      .post(`/employment-relationships/${flow.relationshipId}/submit`)
      .expect(201);

    expect((response.body as { status: string }).status).toBe('PENDING_WORKER_ACCEPTANCE');
  });

  it('la familia no puede aceptar en nombre de la trabajadora', async () => {
    const response = await flow.family.post(
      `/employment-relationships/${flow.relationshipId}/accept`,
    );
    expect(response.status).toBe(403);

    const relationship = await prisma.employmentRelationship.findUniqueOrThrow({
      where: { id: flow.relationshipId },
    });
    expect(relationship.status).toBe('PENDING_WORKER_ACCEPTANCE');
  });

  it('no existe un endpoint genérico para fijar el estado', async () => {
    const patched = await flow.family.patch(`/employment-relationships/${flow.relationshipId}`, {
      status: 'ACTIVE',
    });
    expect(patched.status).toBe(404);

    const put = await flow.family.put(`/employment-relationships/${flow.relationshipId}/status`, {
      status: 'ACTIVE',
    });
    expect(put.status).toBe(404);
  });

  it('la trabajadora acepta y la relación pasa a ACTIVE', async () => {
    const response = await flow.worker
      .post(`/employment-relationships/${flow.relationshipId}/accept`)
      .expect(201);

    expect((response.body as { status: string }).status).toBe('ACTIVE');
  });

  it('deja evidencia de la aceptación de la trabajadora', async () => {
    const relationship = await prisma.employmentRelationship.findUniqueOrThrow({
      where: { id: flow.relationshipId },
    });
    expect(relationship.workerAcceptanceEvidence).not.toBeNull();
  });

  it('editar las condiciones ya aceptadas no reactiva sola la relación', async () => {
    // La relación está ACTIVE: cambiar condiciones no es parte de este sprint.
    const response = await flow.family.patch(
      `/employment-relationships/${flow.relationshipId}/conditions`,
      { ...VALID_CONDITIONS, agreedRemuneration: '400000.00' },
    );
    expect([409, 422]).toContain(response.status);
  });
});

describe('Modificar las condiciones enviadas vuelve a pedir aceptación', () => {
  it('editar en PENDING_WORKER_ACCEPTANCE devuelve la relación a configuración', async () => {
    const flow = await runFullFlow();
    await flow.family.post(`/employment-relationships/${flow.relationshipId}/submit`).expect(201);

    await flow.family
      .patch(`/employment-relationships/${flow.relationshipId}/conditions`, {
        ...VALID_CONDITIONS,
        agreedRemuneration: '420000.00',
        changeReason: 'Se acordó otro monto',
      })
      .expect(200);

    const relationship = await prisma.employmentRelationship.findUniqueOrThrow({
      where: { id: flow.relationshipId },
    });
    // La trabajadora acepta lo que efectivamente ve, no lo que vio antes.
    expect(relationship.status).toBe('PENDING_CONFIGURATION');
  }, 120_000);

  it('deja una sola condición vigente por relación', async () => {
    const flow = await runFullFlow();
    await flow.family
      .patch(`/employment-relationships/${flow.relationshipId}/conditions`, {
        ...VALID_CONDITIONS,
        agreedRemuneration: '380000.00',
      })
      .expect(200);

    const vigentes = await prisma.relationshipTerms.findMany({
      where: { employmentRelationshipId: flow.relationshipId, effectiveTo: null },
    });

    // Corregir un borrador no acumula vigencias: la trabajadora tiene que ver
    // un único juego de condiciones, no un historial de intentos.
    expect(vigentes).toHaveLength(1);
    expect(vigentes[0]?.agreedRemuneration.toFixed(2)).toBe('380000.00');
  }, 120_000);
});

describe('Autorización: casos negativos obligatorios', () => {
  let familyA: Awaited<ReturnType<typeof runFullFlow>>;
  let familyB: Awaited<ReturnType<typeof runFullFlow>>;

  beforeAll(async () => {
    familyA = await runFullFlow();
    familyB = await runFullFlow();
  }, 180_000);

  it('1. una familia no puede ver domicilios de otra familia', async () => {
    const response = await familyB.family.get(`/households/${familyA.householdId}`);
    // 404 y no 403: responder "prohibido" confirmaría que el id existe.
    expect(response.status).toBe(404);

    const list = await familyB.family.get('/households').expect(200);
    const ids = (list.body as { id: string }[]).map((h) => h.id);
    expect(ids).not.toContain(familyA.householdId);
  });

  it('2. una familia no puede ver relaciones de otra familia', async () => {
    const response = await familyB.family.get(
      `/employment-relationships/${familyA.relationshipId}`,
    );
    expect(response.status).toBe(404);

    const list = await familyB.family.get('/employment-relationships').expect(200);
    const ids = (list.body as { id: string }[]).map((r) => r.id);
    expect(ids).not.toContain(familyA.relationshipId);
  });

  it('3. una trabajadora sólo ve las relaciones en las que participa', async () => {
    const response = await familyB.worker.get(
      `/employment-relationships/${familyA.relationshipId}`,
    );
    expect(response.status).toBe(404);

    const list = await familyB.worker.get('/employment-relationships').expect(200);
    const ids = (list.body as { id: string }[]).map((r) => r.id);
    expect(ids).toEqual([familyB.relationshipId]);
  });

  it('4. una trabajadora no puede modificar las condiciones económicas', async () => {
    const response = await familyB.worker.patch(
      `/employment-relationships/${familyB.relationshipId}/conditions`,
      { ...VALID_CONDITIONS, agreedRemuneration: '9000000.00' },
    );
    expect(response.status).toBe(403);

    const terms = await prisma.relationshipTerms.findFirstOrThrow({
      where: { employmentRelationshipId: familyB.relationshipId, effectiveTo: null },
    });
    expect(terms.agreedRemuneration.toFixed(2)).toBe('350000.00');
  });

  it('5. una familia no puede aceptar condiciones en nombre de la trabajadora', async () => {
    await familyB.family
      .post(`/employment-relationships/${familyB.relationshipId}/submit`)
      .expect(201);

    const response = await familyB.family.post(
      `/employment-relationships/${familyB.relationshipId}/accept`,
    );
    expect(response.status).toBe(403);
  });

  it('6. un token de invitación no habilita otras operaciones', async () => {
    const householdId = familyA.householdId;
    const workerEmail = uniqueEmail('otra-trabajadora');
    await familyA.family.post('/worker-invitations', { householdId, workerEmail }).expect(201);

    const token = await familyA.family.invitationToken(workerEmail);

    // Sin sesión, el token sólo sirve para ver de qué invitación se trata.
    const anonymous = new ApiClient(app);
    await anonymous.get(`/worker-invitations/resolve/${token}`).expect(200);

    // No abre nada más: ni el domicilio, ni la relación, ni la lista.
    for (const path of [
      `/households/${householdId}`,
      `/employment-relationships/${familyA.relationshipId}`,
      '/worker-invitations',
    ]) {
      const response = await anonymous.get(path);
      expect(response.status).toBe(401);
    }

    // Y usarlo desde una sesión ajena tampoco alcanza.
    const intruder = new ApiClient(app);
    await intruder.login(uniqueEmail('intrusa'));
    await intruder.createProfile('worker', { ...VALID_PROFILE, firstName: 'Otra' });

    const accepted = await intruder.post('/worker-invitations/accept', { token });
    expect(accepted.status).toBe(403);
  });

  it('7. un usuario autenticado sin perfil no accede a funciones de familia ni de trabajadora', async () => {
    const sinPerfil = new ApiClient(app);
    await sinPerfil.login(uniqueEmail('sin-perfil'));

    // Funciones de familia: el rol no está otorgado.
    expect((await sinPerfil.get('/households')).status).toBe(403);
    expect((await sinPerfil.post('/households', VALID_HOUSEHOLD)).status).toBe(403);
    expect(
      (
        await sinPerfil.post('/worker-invitations', {
          householdId: familyA.householdId,
          workerEmail: uniqueEmail('x'),
        })
      ).status,
    ).toBe(403);

    // Funciones de trabajadora.
    expect(
      (await sinPerfil.post('/worker-invitations/accept', { token: 'x'.repeat(20) })).status,
    ).toBe(403);

    // Y la lista de relaciones existe pero está vacía: no ve nada ajeno.
    const list = await sinPerfil.get('/employment-relationships').expect(200);
    expect(list.body).toEqual([]);
  });

  it('8. el rol general no reemplaza el control de propiedad', async () => {
    // familyB tiene rol FAMILY_EMPLOYER, igual que familyA. El rol la deja pasar
    // por el guard de RBAC, pero el filtro por propietario la detiene igual.
    const meB = await familyB.family.get('/auth/me').expect(200);
    expect((meB.body as { roles: string[] }).roles).toContain('FAMILY_EMPLOYER');

    expect(
      (await familyB.family.patch(`/households/${familyA.householdId}`, { label: 'Robada' }))
        .status,
    ).toBe(404);
    expect((await familyB.family.delete(`/households/${familyA.householdId}`)).status).toBe(404);
    expect(
      (
        await familyB.family.patch(
          `/employment-relationships/${familyA.relationshipId}/conditions`,
          VALID_CONDITIONS,
        )
      ).status,
    ).toBe(404);

    // El domicilio ajeno quedó intacto.
    const household = await prisma.household.findUniqueOrThrow({
      where: { id: familyA.householdId },
    });
    expect(household.label).toBe(VALID_HOUSEHOLD.label);
  });

  it('sin sesión, ningún endpoint del recorrido responde datos', async () => {
    const anonymous = new ApiClient(app);
    for (const path of [
      '/auth/me',
      '/households',
      '/worker-invitations',
      '/employment-relationships',
    ]) {
      expect((await anonymous.get(path)).status).toBe(401);
    }
  });
});

describe('Auditoría del recorrido', () => {
  let flow: Awaited<ReturnType<typeof runFullFlow>>;

  beforeAll(async () => {
    flow = await runFullFlow();
    await flow.family.post(`/employment-relationships/${flow.relationshipId}/submit`).expect(201);
    await flow.worker.post(`/employment-relationships/${flow.relationshipId}/accept`).expect(201);
  }, 120_000);

  it('registra los eventos del recorrido completo', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: flow.familyEmail } });
    const workerUser = await prisma.user.findUniqueOrThrow({ where: { email: flow.workerEmail } });

    const events = await prisma.auditEvent.findMany({
      where: { actorUserId: { in: [user.id, workerUser.id] } },
    });
    const actions = new Set(events.map((e) => e.action));

    for (const expected of [
      'LOGIN_SUCCEEDED',
      'EMPLOYER_PROFILE_CREATED',
      'WORKER_PROFILE_CREATED',
      'HOUSEHOLD_CREATED',
      'INVITATION_CREATED',
      'INVITATION_ACCEPTED',
      'RELATIONSHIP_CREATED',
      'RELATIONSHIP_CONDITIONS_UPDATED',
      'RELATIONSHIP_CONDITIONS_SUBMITTED',
      'RELATIONSHIP_CONDITIONS_ACCEPTED',
      'RELATIONSHIP_ACTIVATED',
      'WORK_SCHEDULE_CREATED',
    ]) {
      expect(actions).toContain(expected);
    }
  });

  it('nunca guarda códigos, tokens ni encabezados Authorization', async () => {
    const events = await prisma.auditEvent.findMany({ take: 500, orderBy: { occurredAt: 'desc' } });
    const serialized = JSON.stringify(events);

    expect(serialized).not.toMatch(/authorization/i);
    expect(serialized).not.toMatch(/refreshToken/i);
    expect(serialized).not.toMatch(/tokenHash/i);
    expect(serialized).not.toMatch(/"code"\s*:\s*"\d{6}"/);
    expect(serialized).not.toMatch(/Bearer /);
  });

  it('el evento de auditoría se persiste junto al cambio, no después', async () => {
    // Si el household existe, su evento tiene que existir: se escriben en la
    // misma transacción, así que no puede haber uno sin el otro.
    const created = await prisma.auditEvent.findFirst({
      where: { action: 'HOUSEHOLD_CREATED', entityId: flow.householdId },
    });
    expect(created).not.toBeNull();
  });
});
