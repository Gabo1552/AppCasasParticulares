import { describe, expect, it } from 'vitest';
import { InvalidValueError } from '../errors';
import { DateRange, assertLocalDate } from '../value-objects/date-range';
import { MaskedAccount, isValidCbuFormat } from '../value-objects/masked-account';
import { Minutes } from '../value-objects/minutes';

describe('Minutes', () => {
  it('rechaza minutos fraccionarios y negativos', () => {
    expect(() => Minutes.of(90.5)).toThrow(InvalidValueError);
    expect(() => Minutes.of(-10)).toThrow(InvalidValueError);
  });

  it('calcula minutos entre dos instantes', () => {
    const from = new Date('2026-05-04T09:00:00.000Z');
    const to = new Date('2026-05-04T16:20:00.000Z');
    expect(Minutes.between(from, to).value).toBe(440);
  });

  it('rechaza una salida anterior a la entrada', () => {
    expect(() =>
      Minutes.between(new Date('2026-05-04T16:00:00Z'), new Date('2026-05-04T09:00:00Z')),
    ).toThrow(/salida no puede ser anterior/);
  });

  it('convierte a horas con precisión decimal, sin truncar', () => {
    // 7h20m no tiene representación exacta en horas decimales: por eso el dominio
    // guarda minutos y convierte una sola vez, dentro del cálculo.
    const hours = Minutes.of(440).toHours();
    expect(hours.toFixed(10)).toBe('7.3333333333');
    expect(hours.times(60).toString()).toBe('440');
  });

  it('suma y resta', () => {
    expect(Minutes.sum([Minutes.of(120), Minutes.of(45), Minutes.of(15)]).value).toBe(180);
    expect(Minutes.of(120).subtract(Minutes.of(45)).value).toBe(75);
    expect(() => Minutes.of(45).subtract(Minutes.of(120))).toThrow(InvalidValueError);
  });

  it('formatea de manera legible', () => {
    expect(Minutes.of(440).format()).toBe('7h 20m');
    expect(Minutes.of(480).format()).toBe('8h');
  });
});

describe('DateRange', () => {
  it('valida el formato y la existencia de la fecha', () => {
    expect(assertLocalDate('2026-05-04')).toBe('2026-05-04');
    expect(() => assertLocalDate('04/05/2026')).toThrow(InvalidValueError);
    expect(() => assertLocalDate('2026-02-30')).toThrow(/no es una fecha válida/);
  });

  it('rechaza un fin anterior al inicio', () => {
    expect(() => DateRange.of('2026-05-01', '2026-04-30')).toThrow(InvalidValueError);
  });

  it('es cerrado en ambos extremos', () => {
    const range = DateRange.of('2026-05-01', '2026-06-30');
    expect(range.contains('2026-05-01')).toBe(true);
    expect(range.contains('2026-06-30')).toBe(true);
    expect(range.contains('2026-07-01')).toBe(false);
    expect(range.contains('2026-04-30')).toBe(false);
  });

  it('un rango abierto no tiene fin', () => {
    const range = DateRange.openEnded('2026-05-01');
    expect(range.isOpenEnded()).toBe(true);
    expect(range.contains('2099-12-31')).toBe(true);
  });

  it('detecta solapamientos', () => {
    const a = DateRange.of('2026-01-01', '2026-06-30');
    const b = DateRange.of('2026-06-30', '2026-12-31');
    const c = DateRange.of('2026-07-01', '2026-12-31');
    expect(a.overlaps(b)).toBe(true);
    expect(a.overlaps(c)).toBe(false);
  });

  it('rechaza una línea de tiempo con vigencias solapadas (INV-REL-03)', () => {
    expect(() =>
      DateRange.assertNoOverlap(
        [DateRange.of('2026-01-01', '2026-06-30'), DateRange.of('2026-06-01', null)],
        'las condiciones de la relación',
      ),
    ).toThrow(/Se solapan/);
  });

  it('acepta una línea de tiempo contigua sin solapamiento', () => {
    expect(() =>
      DateRange.assertNoOverlap([
        DateRange.of('2026-01-01', '2026-06-30'),
        DateRange.of('2026-07-01', null),
      ]),
    ).not.toThrow();
  });

  it('resuelve qué versión rige en una fecha', () => {
    const items = [
      { id: 'v1', effectiveRange: DateRange.of('2026-01-01', '2026-06-30') },
      { id: 'v2', effectiveRange: DateRange.openEnded('2026-07-01') },
    ];
    expect(DateRange.findEffectiveAt(items, '2026-05-15')?.id).toBe('v1');
    expect(DateRange.findEffectiveAt(items, '2026-08-15')?.id).toBe('v2');
    expect(DateRange.findEffectiveAt(items, '2025-12-31')).toBeUndefined();
  });
});

describe('MaskedAccount', () => {
  // CBU ficticio, generado para pruebas. No corresponde a ninguna cuenta real.
  const FICTITIOUS_CBU = '2850590940090418135201';

  it('conserva sólo los últimos 4 dígitos', () => {
    const account = MaskedAccount.fromFullNumber(FICTITIOUS_CBU, 'CBU');
    expect(account.last4).toBe('5201');
    expect(account.toString()).toBe(`${'•'.repeat(18)}5201`);
  });

  it('no expone el número completo por ningún camino', () => {
    const account = MaskedAccount.fromFullNumber(FICTITIOUS_CBU, 'CBU', 'mi.alias.ficticio');
    const serialized = JSON.stringify(account);
    expect(serialized).not.toContain(FICTITIOUS_CBU);
    expect(serialized).not.toContain(FICTITIOUS_CBU.slice(0, 18));
    expect(Object.values(account).join('|')).not.toContain(FICTITIOUS_CBU);
  });

  it('rechaza un número que no tiene 22 dígitos', () => {
    expect(() => MaskedAccount.fromFullNumber('123', 'CBU')).toThrow(/22 dígitos/);
  });

  it('se reconstruye desde lo persistido sin pasar por el número completo', () => {
    const account = MaskedAccount.fromLast4('CVU', '5201', 'alias.ficticio');
    expect(account.kind).toBe('CVU');
    expect(account.last4).toBe('5201');
    expect(() => MaskedAccount.fromLast4('CVU', '52')).toThrow(/exactamente 4/);
  });

  it('valida el dígito verificador del CBU', () => {
    expect(isValidCbuFormat(FICTITIOUS_CBU)).toBe(true);
    // Alterar un dígito del cuerpo invalida el verificador.
    expect(isValidCbuFormat('2850590940090418135202')).toBe(false);
    expect(isValidCbuFormat('123')).toBe(false);
  });
});
