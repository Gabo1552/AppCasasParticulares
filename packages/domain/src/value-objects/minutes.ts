import { Decimal } from 'decimal.js';
import { InvalidValueError } from '../errors';

/**
 * Tiempo trabajado, medido en minutos enteros.
 *
 * El dominio mide en minutos y no en horas fraccionarias por la misma razón por la
 * que el dinero se mide en decimal: 7 horas y 20 minutos no tiene representación
 * exacta en horas decimales, y ese redondeo prematuro terminaría en el importe.
 *
 * La conversión a horas ocurre una sola vez, al multiplicar por el valor hora, y con
 * la precisión decimal del cálculo.
 */
export class Minutes {
  private constructor(readonly value: number) {}

  static of(minutes: number): Minutes {
    if (!Number.isInteger(minutes)) {
      throw new InvalidValueError('El tiempo trabajado se mide en minutos enteros.', { minutes });
    }
    if (minutes < 0) {
      throw new InvalidValueError('El tiempo trabajado no puede ser negativo.', { minutes });
    }
    return new Minutes(minutes);
  }

  static zero(): Minutes {
    return new Minutes(0);
  }

  static fromHoursAndMinutes(hours: number, minutes: number): Minutes {
    return Minutes.of(hours * 60 + minutes);
  }

  /**
   * Minutos entre dos instantes. Se calcula sobre epoch, así que es correcto aunque
   * el intervalo cruce un cambio de huso o de horario de verano.
   */
  static between(from: Date, to: Date): Minutes {
    const diffMs = to.getTime() - from.getTime();
    if (diffMs < 0) {
      throw new InvalidValueError('La salida no puede ser anterior a la entrada.', {
        from: from.toISOString(),
        to: to.toISOString(),
      });
    }
    return Minutes.of(Math.round(diffMs / 60_000));
  }

  add(other: Minutes): Minutes {
    return new Minutes(this.value + other.value);
  }

  subtract(other: Minutes): Minutes {
    const result = this.value - other.value;
    if (result < 0) {
      throw new InvalidValueError('La resta de minutos no puede dar negativo.', {
        left: this.value,
        right: other.value,
      });
    }
    return new Minutes(result);
  }

  /** Horas como Decimal exacto, para multiplicar por un valor hora. */
  toHours(): Decimal {
    return new Decimal(this.value).dividedBy(60);
  }

  isZero(): boolean {
    return this.value === 0;
  }

  greaterThan(other: Minutes): boolean {
    return this.value > other.value;
  }

  /** Formato legible: "7h 20m". */
  format(): string {
    const hours = Math.floor(this.value / 60);
    const minutes = this.value % 60;
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  }

  toJSON(): number {
    return this.value;
  }

  static sum(items: readonly Minutes[]): Minutes {
    return items.reduce<Minutes>((acc, item) => acc.add(item), Minutes.zero());
  }
}
