import { describe, expect, it } from 'vitest';
import { InvalidValueError } from '../errors';
import { Money, RoundingMode } from '../value-objects/money';

describe('Money', () => {
  describe('construcción', () => {
    it('acepta un string decimal y lo conserva exacto', () => {
      expect(Money.of('1234.5678').toString()).toBe('1234.5678');
    });

    it('acepta enteros', () => {
      expect(Money.of(1000).toString()).toBe('1000');
    });

    it('rechaza un number con decimales porque el literal ya perdió precisión', () => {
      expect(() => Money.of(1234.56)).toThrow(InvalidValueError);
    });

    it('rechaza NaN e infinito', () => {
      expect(() => Money.of(Number.NaN)).toThrow(InvalidValueError);
      expect(() => Money.of(Number.POSITIVE_INFINITY)).toThrow(InvalidValueError);
    });

    it('rechaza texto que no es un número', () => {
      expect(() => Money.of('mil pesos')).toThrow(InvalidValueError);
    });
  });

  describe('precisión decimal (RN-13)', () => {
    it('suma sin el error binario del punto flotante', () => {
      // El caso canónico: 0.1 + 0.2 === 0.30000000000000004 en float.
      const result = Money.of('0.1').add(Money.of('0.2'));
      expect(result.toString()).toBe('0.3');
      expect(result.equals(Money.of('0.3'))).toBe(true);
    });

    it('mantiene exactitud al acumular muchos importes pequeños', () => {
      const cents = Array.from({ length: 1000 }, () => Money.of('0.01'));
      expect(Money.sum(cents).toString()).toBe('10');
    });

    it('multiplica con precisión en una base horaria', () => {
      // 7h20m = 7.3333... horas. La fracción no se trunca antes del importe.
      const hourlyRate = Money.of('1500.00');
      const result = hourlyRate.multiply('7.333333333333333333333333333');
      expect(result.round(2).toString()).toBe('11000');
    });
  });

  describe('redondeo explícito', () => {
    it('HALF_UP redondea el medio hacia arriba', () => {
      expect(Money.of('2.345').round(2, RoundingMode.HALF_UP).toString()).toBe('2.35');
    });

    it('HALF_EVEN redondea el medio hacia el par', () => {
      expect(Money.of('2.345').round(2, RoundingMode.HALF_EVEN).toString()).toBe('2.34');
      expect(Money.of('2.355').round(2, RoundingMode.HALF_EVEN).toString()).toBe('2.36');
    });

    it('DOWN trunca', () => {
      expect(Money.of('2.349').round(2, RoundingMode.DOWN).toString()).toBe('2.34');
    });

    it('no redondea implícitamente en las operaciones', () => {
      const result = Money.of('10').divide(3);
      expect(result.toString().startsWith('3.3333333')).toBe(true);
    });

    it('rechaza una cantidad de decimales inválida', () => {
      expect(() => Money.of('1').round(-1)).toThrow(InvalidValueError);
      expect(() => Money.of('1').round(1.5)).toThrow(InvalidValueError);
    });
  });

  describe('porcentajes', () => {
    it('aplica un porcentaje enunciado como número', () => {
      expect(Money.of('100000').applyPercentage('11').toString()).toBe('11000');
    });

    it('soporta porcentajes con decimales', () => {
      expect(Money.of('250000').applyPercentage('2.5').toString()).toBe('6250');
    });
  });

  describe('comparación', () => {
    it('compara importes', () => {
      expect(Money.of('100').greaterThan(Money.of('99.99'))).toBe(true);
      expect(Money.of('100').lessThan(Money.of('100.01'))).toBe(true);
      expect(Money.of('100').greaterThanOrEqual(Money.of('100'))).toBe(true);
    });

    it('distingue cero, positivo y negativo', () => {
      expect(Money.zero().isZero()).toBe(true);
      expect(Money.of('-1').isNegative()).toBe(true);
      expect(Money.of('1').isPositive()).toBe(true);
      expect(Money.zero().isPositive()).toBe(false);
    });

    it('devuelve máximo y mínimo', () => {
      expect(Money.max(Money.of('10'), Money.of('20')).toString()).toBe('20');
      expect(Money.min(Money.of('10'), Money.of('20')).toString()).toBe('10');
    });
  });

  describe('serialización', () => {
    it('JSON lleva string decimal con la escala de almacenamiento, no number', () => {
      const json = Money.of('1234.56').toJSON();
      expect(json).toEqual({ amount: '1234.5600', currency: 'ARS' });
      expect(typeof json.amount).toBe('string');
    });

    it('no usa notación exponencial en importes grandes', () => {
      expect(Money.of('123456789012345.6789').toString()).toBe('123456789012345.6789');
    });
  });

  describe('operaciones inválidas', () => {
    it('rechaza la división por cero', () => {
      expect(() => Money.of('100').divide(0)).toThrow(InvalidValueError);
    });
  });
});
