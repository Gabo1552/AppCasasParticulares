import { Decimal } from 'decimal.js';
import { InvalidValueError } from '../errors';

/**
 * Importes monetarios con precisión decimal exacta.
 *
 * Regla no negociable del encargo (principio 11) y del documento (RN-13, sección 14.1):
 * nunca `float` para dinero. Esta clase es la única forma admitida de representar un
 * importe dentro del dominio y del motor de liquidación.
 *
 * Se serializa como **string decimal**, no como número: JSON no tiene decimal exacto,
 * así que devolver un `number` reintroduciría el error binario que se está evitando
 * en todos los demás puntos (docs/architecture.md §7).
 */

// 28 dígitos significativos: sobra para cualquier importe en ARS y deja margen a los
// productos intermedios de un cálculo de proporcionalidad.
Decimal.set({ precision: 28, toExpNeg: -9e15, toExpPos: 9e15 });

export type Currency = 'ARS';

/** Modos de redondeo admitidos. El parámetro normativo elige cuál aplica por concepto. */
export const RoundingMode = {
  /** Medio hacia arriba: 2.345 → 2.35. */
  HALF_UP: 'HALF_UP',
  /** Medio hacia par (bancario): 2.345 → 2.34, 2.355 → 2.36. */
  HALF_EVEN: 'HALF_EVEN',
  /** Trunca hacia cero. */
  DOWN: 'DOWN',
  /** Aleja de cero. */
  UP: 'UP',
} as const;

export type RoundingMode = (typeof RoundingMode)[keyof typeof RoundingMode];

const DECIMAL_ROUNDING: Record<RoundingMode, Decimal.Rounding> = {
  HALF_UP: Decimal.ROUND_HALF_UP,
  HALF_EVEN: Decimal.ROUND_HALF_EVEN,
  DOWN: Decimal.ROUND_DOWN,
  UP: Decimal.ROUND_UP,
};

/** Escala de almacenamiento: coincide con NUMERIC(18,4) en PostgreSQL. */
export const MONEY_SCALE = 4;

export class Money {
  private constructor(
    private readonly value: Decimal,
    readonly currency: Currency,
  ) {}

  // ─── Construcción ──────────────────────────────────────────────────────────

  /**
   * Crea un importe. Acepta string (lo habitual: viene de la base o del JSON),
   * entero seguro o Decimal.
   *
   * Rechaza `number` no entero a propósito: si alguien escribe `Money.of(1234.56)`
   * el literal ya perdió precisión antes de llegar acá, y aceptarlo daría una falsa
   * sensación de exactitud.
   */
  static of(amount: string | number | Decimal, currency: Currency = 'ARS'): Money {
    if (typeof amount === 'number') {
      if (!Number.isFinite(amount)) {
        throw new InvalidValueError('Un importe no puede ser NaN ni infinito.', { amount });
      }
      if (!Number.isInteger(amount)) {
        throw new InvalidValueError(
          'Money.of() no acepta números con decimales: el literal ya perdió precisión. ' +
            'Pasá un string, por ejemplo Money.of("1234.56").',
          { amount },
        );
      }
    }

    let decimal: Decimal;
    try {
      decimal = new Decimal(amount);
    } catch {
      throw new InvalidValueError('Importe con formato inválido.', { amount });
    }

    if (!decimal.isFinite()) {
      throw new InvalidValueError('Un importe no puede ser NaN ni infinito.', { amount });
    }

    return new Money(decimal, currency);
  }

  static zero(currency: Currency = 'ARS'): Money {
    return new Money(new Decimal(0), currency);
  }

  // ─── Aritmética ────────────────────────────────────────────────────────────

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.plus(other.value), this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.minus(other.value), this.currency);
  }

  /** Multiplica por un escalar (cantidad de horas, porcentaje, coeficiente). */
  multiply(factor: string | number | Decimal): Money {
    return new Money(this.value.times(new Decimal(factor)), this.currency);
  }

  /** Divide por un escalar. Lanza si el divisor es cero. */
  divide(divisor: string | number | Decimal): Money {
    const d = new Decimal(divisor);
    if (d.isZero()) {
      throw new InvalidValueError('División por cero en un cálculo monetario.', {
        amount: this.toString(),
      });
    }
    return new Money(this.value.dividedBy(d), this.currency);
  }

  /**
   * Aplica un porcentaje. `percentage` es el número tal como se enuncia:
   * `applyPercentage('11')` calcula el 11 %.
   */
  applyPercentage(percentage: string | number | Decimal): Money {
    return new Money(this.value.times(new Decimal(percentage)).dividedBy(100), this.currency);
  }

  negate(): Money {
    return new Money(this.value.negated(), this.currency);
  }

  abs(): Money {
    return new Money(this.value.abs(), this.currency);
  }

  // ─── Redondeo ──────────────────────────────────────────────────────────────

  /**
   * Redondea a una cantidad de decimales con un modo explícito.
   *
   * No hay redondeo implícito en ninguna operación: el punto de redondeo lo decide
   * el parámetro normativo y queda registrado en la traza del cálculo (RN-13).
   */
  round(decimals: number, mode: RoundingMode = RoundingMode.HALF_UP): Money {
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > MONEY_SCALE + 4) {
      throw new InvalidValueError('Cantidad de decimales inválida para redondeo.', { decimals });
    }
    return new Money(this.value.toDecimalPlaces(decimals, DECIMAL_ROUNDING[mode]), this.currency);
  }

  /** Redondea a la escala de almacenamiento (4 decimales). */
  toStorageScale(mode: RoundingMode = RoundingMode.HALF_UP): Money {
    return this.round(MONEY_SCALE, mode);
  }

  // ─── Comparación ───────────────────────────────────────────────────────────

  equals(other: Money): boolean {
    return this.currency === other.currency && this.value.equals(other.value);
  }

  greaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.greaterThan(other.value);
  }

  greaterThanOrEqual(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.greaterThanOrEqualTo(other.value);
  }

  lessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.lessThan(other.value);
  }

  lessThanOrEqual(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.lessThanOrEqualTo(other.value);
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isNegative(): boolean {
    return this.value.isNegative() && !this.value.isZero();
  }

  isPositive(): boolean {
    return this.value.isPositive() && !this.value.isZero();
  }

  // ─── Serialización ─────────────────────────────────────────────────────────

  /** Representación canónica: string decimal sin notación exponencial. */
  toString(): string {
    return this.value.toFixed();
  }

  /** Alias explícito para quien lee el código en el borde de la API. */
  toDecimalString(): string {
    return this.toString();
  }

  /** Lo que viaja por JSON: `{ amount: "1234.5600", currency: "ARS" }`. */
  toJSON(): { amount: string; currency: Currency } {
    return { amount: this.value.toFixed(MONEY_SCALE), currency: this.currency };
  }

  /** Escape hatch para persistencia (Prisma.Decimal acepta el Decimal directamente). */
  toDecimal(): Decimal {
    return new Decimal(this.value);
  }

  /**
   * Formato para mostrar al usuario. Sólo para presentación: nunca uses el resultado
   * como entrada de otro cálculo.
   */
  format(locale = 'es-AR'): string {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: this.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(this.round(2).toString()));
  }

  // ─── Helpers estáticos ─────────────────────────────────────────────────────

  static sum(items: readonly Money[], currency: Currency = 'ARS'): Money {
    return items.reduce<Money>((acc, item) => acc.add(item), Money.zero(currency));
  }

  static max(a: Money, b: Money): Money {
    return a.greaterThan(b) ? a : b;
  }

  static min(a: Money, b: Money): Money {
    return a.lessThan(b) ? a : b;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new InvalidValueError('No se pueden combinar importes de monedas distintas.', {
        left: this.currency,
        right: other.currency,
      });
    }
  }
}
