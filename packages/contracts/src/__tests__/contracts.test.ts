import { describe, expect, it } from 'vitest';
import {
  clockEventRequestSchema,
  createWorkScheduleRequestSchema,
  cuilSchema,
  isValidCuil,
  moneySchema,
  registerRequestSchema,
  workScheduleRuleSchema,
} from '../index';

describe('Esquema de importes', () => {
  it('acepta un decimal como string', () => {
    expect(moneySchema.safeParse('1234.56').success).toBe(true);
    expect(moneySchema.safeParse('1234').success).toBe(true);
    expect(moneySchema.safeParse('-500.1234').success).toBe(true);
  });

  it('rechaza un number: JSON no tiene decimal exacto (RN-13)', () => {
    expect(moneySchema.safeParse(1234.56).success).toBe(false);
  });

  it('rechaza más de 4 decimales y notación exponencial', () => {
    expect(moneySchema.safeParse('1234.56789').success).toBe(false);
    expect(moneySchema.safeParse('1.2e5').success).toBe(false);
  });
});

describe('Validación de CUIL', () => {
  it('acepta un CUIL ficticio con dígito verificador correcto', () => {
    // Construido para la prueba: 20-12345678-? → verificador calculado.
    const digits = '2012345678';
    const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 10; i += 1) sum += Number(digits[i]) * (weights[i] ?? 0);
    const remainder = sum % 11;
    const check = remainder === 0 ? 0 : remainder === 1 ? 9 : 11 - remainder;
    const cuil = `${digits}${check}`;

    expect(isValidCuil(cuil)).toBe(true);
    expect(cuilSchema.safeParse(cuil).success).toBe(true);
  });

  it('rechaza un dígito verificador incorrecto', () => {
    expect(isValidCuil('20123456789')).toBe(false);
  });

  it('rechaza longitudes distintas de 11', () => {
    expect(isValidCuil('2012345678')).toBe(false);
    expect(cuilSchema.safeParse('123').success).toBe(false);
  });
});

describe('Registro', () => {
  const valid = {
    email: 'demo@ejemplo-ficticio.test',
    displayName: 'Demo Ficticio',
    password: 'contrasena-larga-de-prueba',
    role: 'FAMILY_EMPLOYER' as const,
    acceptedConsentDocumentIds: ['00000000-0000-4000-8000-000000000001'],
  };

  it('acepta un registro válido', () => {
    expect(registerRequestSchema.safeParse(valid).success).toBe(true);
  });

  it('exige correo o teléfono (SEG-01)', () => {
    const { email: _email, ...withoutContact } = valid;
    expect(registerRequestSchema.safeParse(withoutContact).success).toBe(false);
  });

  it('exige al menos un consentimiento aceptado (SEG-04)', () => {
    expect(
      registerRequestSchema.safeParse({ ...valid, acceptedConsentDocumentIds: [] }).success,
    ).toBe(false);
  });

  it('rechaza campos desconocidos: nada de contrabando en el body', () => {
    expect(
      registerRequestSchema.safeParse({ ...valid, isAdmin: true, claveFiscal: 'x' }).success,
    ).toBe(false);
  });

  it('exige contraseña de longitud mínima', () => {
    expect(registerRequestSchema.safeParse({ ...valid, password: 'corta' }).success).toBe(false);
  });
});

describe('Fichaje', () => {
  const valid = {
    kind: 'CLOCK_IN' as const,
    declaredAt: '2026-05-04T12:00:00.000Z',
    timezone: 'America/Argentina/Cordoba',
    method: 'QR' as const,
    clientIdempotencyKey: '00000000-0000-4000-8000-000000000010',
  };

  it('acepta un fichaje sin ubicación: no consentirla no impide fichar (FIC-02, FIC-09)', () => {
    expect(clockEventRequestSchema.safeParse(valid).success).toBe(true);
  });

  it('acepta ubicación puntual con precisión declarada', () => {
    const result = clockEventRequestSchema.safeParse({
      ...valid,
      method: 'PROXIMITY',
      location: { lat: -31.42, lng: -64.19, accuracyMeters: 40 },
    });
    expect(result.success).toBe(true);
  });

  it('exige la clave de idempotencia generada por el cliente (FIC-03)', () => {
    const { clientIdempotencyKey: _key, ...withoutKey } = valid;
    expect(clockEventRequestSchema.safeParse(withoutKey).success).toBe(false);
  });

  it('rechaza coordenadas fuera de rango', () => {
    expect(
      clockEventRequestSchema.safeParse({
        ...valid,
        location: { lat: 200, lng: -64.19, accuracyMeters: 40 },
      }).success,
    ).toBe(false);
  });
});

describe('Calendario', () => {
  it('rechaza una regla con salida anterior a la entrada', () => {
    expect(
      workScheduleRuleSchema.safeParse({ dayOfWeek: 1, startMinute: 900, endMinute: 540 }).success,
    ).toBe(false);
  });

  it('exige que el método por defecto esté entre los habilitados (FIC-02)', () => {
    const result = createWorkScheduleRequestSchema.safeParse({
      effectiveFrom: '2026-05-01',
      allowedMethods: ['QR', 'PIN'],
      defaultMethod: 'PROXIMITY',
      rules: [{ dayOfWeek: 1, startMinute: 540, endMinute: 900, breakMinutes: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it('acepta un calendario semanal válido', () => {
    const result = createWorkScheduleRequestSchema.safeParse({
      effectiveFrom: '2026-05-01',
      allowedMethods: ['QR', 'PIN'],
      defaultMethod: 'QR',
      rules: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
        dayOfWeek,
        startMinute: 540,
        endMinute: 900,
        breakMinutes: 0,
      })),
    });
    expect(result.success).toBe(true);
  });
});
