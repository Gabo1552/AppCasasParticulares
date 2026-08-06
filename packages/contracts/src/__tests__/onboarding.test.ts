import { describe, expect, it } from 'vitest';
import {
  createInvitationSchema,
  createProfileSchema,
  householdSchema,
  putWorkScheduleSchema,
  relationshipConditionsSchema,
  requestCodeSchema,
  toMinutes,
  toTimeOfDay,
  verifyCodeSchema,
  workScheduleDaySchema,
} from '../onboarding';

describe('Identidad', () => {
  it('normaliza el correo a minúsculas y sin espacios', () => {
    const parsed = requestCodeSchema.parse({ email: '  Ana@Example.TEST ' });
    expect(parsed.email).toBe('ana@example.test');
  });

  it('rechaza un correo inválido', () => {
    expect(() => requestCodeSchema.parse({ email: 'ana-sin-arroba' })).toThrow();
  });

  it('exige exactamente seis dígitos en el código', () => {
    expect(() => verifyCodeSchema.parse({ email: 'ana@example.test', code: '12345' })).toThrow();
    expect(() => verifyCodeSchema.parse({ email: 'ana@example.test', code: '12345a' })).toThrow();
    expect(verifyCodeSchema.parse({ email: 'ana@example.test', code: '123456' }).code).toBe(
      '123456',
    );
  });

  it('rechaza campos desconocidos en lugar de ignorarlos', () => {
    expect(() =>
      requestCodeSchema.parse({ email: 'ana@example.test', role: 'PLATFORM_ADMIN' }),
    ).toThrow();
  });
});

describe('Perfil', () => {
  const valid = {
    firstName: 'Ana',
    lastName: 'Gómez',
    phone: '+54 11 5555-1234',
    consents: { acceptedTerms: true, acceptedPrivacyPolicy: true },
  };

  it('acepta un perfil completo y aplica la zona horaria por defecto', () => {
    const parsed = createProfileSchema.parse(valid);
    expect(parsed.timezone).toBe('America/Argentina/Buenos_Aires');
  });

  it('no acepta el perfil sin los dos consentimientos', () => {
    expect(() =>
      createProfileSchema.parse({
        ...valid,
        consents: { acceptedTerms: true, acceptedPrivacyPolicy: false },
      }),
    ).toThrow();
  });

  it('no admite datos que no se piden en esta etapa (clave fiscal, CUIL, banco)', () => {
    for (const extra of [
      { claveFiscal: '1234' },
      { cuil: '27123456783' },
      { cbu: '0'.repeat(22) },
    ]) {
      expect(() => createProfileSchema.parse({ ...valid, ...extra })).toThrow();
    }
  });
});

describe('Domicilio laboral', () => {
  const valid = {
    label: 'Casa de Palermo',
    street: 'Av. Santa Fe',
    streetNumber: '3200',
    city: 'CABA',
    province: 'Ciudad Autónoma de Buenos Aires',
    postalCode: 'C1425',
  };

  it('acepta el domicilio mínimo', () => {
    expect(householdSchema.parse(valid).timezone).toBe('America/Argentina/Buenos_Aires');
  });

  it('exige calle, número, localidad, provincia y código postal', () => {
    for (const field of ['street', 'streetNumber', 'city', 'province', 'postalCode']) {
      const incomplete: Record<string, unknown> = { ...valid };
      delete incomplete[field];
      expect(() => householdSchema.parse(incomplete)).toThrow();
    }
  });

  it('no admite coordenadas: la geolocalización no es parte de este sprint', () => {
    expect(() => householdSchema.parse({ ...valid, latitude: -34.6, longitude: -58.4 })).toThrow();
  });
});

describe('Invitación', () => {
  it('vence en una semana si no se indica otra cosa', () => {
    const parsed = createInvitationSchema.parse({
      householdId: '00000000-0000-4000-8000-000000000000',
      workerEmail: 'trabajadora@example.test',
    });
    expect(parsed.expiresInDays).toBe(7);
  });

  it('no admite una vigencia mayor a treinta días', () => {
    expect(() =>
      createInvitationSchema.parse({
        householdId: '00000000-0000-4000-8000-000000000000',
        workerEmail: 'trabajadora@example.test',
        expiresInDays: 365,
      }),
    ).toThrow();
  });
});

describe('Condiciones de la relación laboral', () => {
  const valid = {
    plannedStartDate: '2026-09-01',
    categoryCode: 'TAREAS_GENERALES',
    liveInMode: 'WITH_WITHDRAWAL',
    remunerationScheme: 'MONTHLY',
    agreedRemuneration: '350000.00',
    weeklyHours: 24,
  };

  it('acepta la remuneración como string decimal', () => {
    const parsed = relationshipConditionsSchema.parse(valid);
    expect(parsed.agreedRemuneration).toBe('350000.00');
    expect(typeof parsed.agreedRemuneration).toBe('string');
  });

  it('rechaza la remuneración como number: JSON no tiene decimal exacto (RN-13)', () => {
    expect(() =>
      relationshipConditionsSchema.parse({ ...valid, agreedRemuneration: 350000.0 }),
    ).toThrow();
  });

  it('rechaza una remuneración cero o negativa', () => {
    expect(() =>
      relationshipConditionsSchema.parse({ ...valid, agreedRemuneration: '0.00' }),
    ).toThrow();
    expect(() =>
      relationshipConditionsSchema.parse({ ...valid, agreedRemuneration: '-100.00' }),
    ).toThrow();
  });

  it('acota el día de pago al rango de un mes', () => {
    expect(relationshipConditionsSchema.parse({ ...valid, paymentDayOfMonth: 5 })).toBeDefined();
    expect(() => relationshipConditionsSchema.parse({ ...valid, paymentDayOfMonth: 32 })).toThrow();
  });

  it('acota las horas semanales a lo que tiene una semana', () => {
    expect(() => relationshipConditionsSchema.parse({ ...valid, weeklyHours: 0 })).toThrow();
    expect(() => relationshipConditionsSchema.parse({ ...valid, weeklyHours: 200 })).toThrow();
  });

  it('no admite fijar el estado desde el body', () => {
    expect(() => relationshipConditionsSchema.parse({ ...valid, status: 'ACTIVE' })).toThrow();
  });
});

describe('Calendario semanal', () => {
  const monday = { dayOfWeek: 1, startTime: '08:00', endTime: '16:00', breakMinutes: 30 };

  it('acepta un bloque válido', () => {
    expect(workScheduleDaySchema.parse(monday).breakMinutes).toBe(30);
  });

  it('exige que la salida sea posterior a la entrada', () => {
    expect(() => workScheduleDaySchema.parse({ ...monday, endTime: '07:00' })).toThrow();
    expect(() => workScheduleDaySchema.parse({ ...monday, endTime: '08:00' })).toThrow();
  });

  it('no admite una pausa que se coma la jornada', () => {
    expect(() => workScheduleDaySchema.parse({ ...monday, breakMinutes: 480 })).toThrow();
  });

  it('exige el formato HH:MM de 24 horas', () => {
    expect(() => workScheduleDaySchema.parse({ ...monday, startTime: '8:00' })).toThrow();
    expect(() => workScheduleDaySchema.parse({ ...monday, startTime: '25:00' })).toThrow();
  });

  it('exige al menos un día para poder publicar el horario', () => {
    expect(() => putWorkScheduleSchema.parse({ effectiveFrom: '2026-09-01', days: [] })).toThrow();
  });

  it('no admite dos bloques para el mismo día (evita solapamientos)', () => {
    expect(() =>
      putWorkScheduleSchema.parse({
        effectiveFrom: '2026-09-01',
        days: [monday, { ...monday, startTime: '17:00', endTime: '19:00' }],
      }),
    ).toThrow();
  });

  it('acepta hasta siete días distintos', () => {
    const days = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ ...monday, dayOfWeek }));
    expect(putWorkScheduleSchema.parse({ effectiveFrom: '2026-09-01', days }).days).toHaveLength(7);
  });

  it('convierte entre HH:MM y minutos de forma reversible', () => {
    for (const time of ['00:00', '08:30', '13:45', '23:59']) {
      expect(toTimeOfDay(toMinutes(time))).toBe(time);
    }
    expect(toMinutes('08:30')).toBe(510);
  });
});
