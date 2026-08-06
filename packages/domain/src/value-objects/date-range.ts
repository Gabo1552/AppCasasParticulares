import { InvalidValueError } from '../errors';

/** Fecha civil sin hora, en formato ISO `YYYY-MM-DD`. */
export type LocalDate = string;

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function assertLocalDate(value: string, field = 'fecha'): LocalDate {
  if (!LOCAL_DATE_PATTERN.test(value)) {
    throw new InvalidValueError(`${field} debe tener formato YYYY-MM-DD.`, { value });
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new InvalidValueError(`${field} no es una fecha válida del calendario.`, { value });
  }
  return value;
}

/**
 * Rango de vigencia con extremo final abierto.
 *
 * Es la forma en que el dominio versiona todo lo que cambia en el tiempo: condiciones
 * de la relación laboral (REL-05), parámetros normativos (RN-01), delegaciones.
 * `to === null` significa vigente.
 *
 * El rango es cerrado en ambos extremos: `from` y `to` **están incluidos**. Un
 * parámetro con `to = '2026-06-30'` sigue vigente ese día.
 */
export class DateRange {
  private constructor(
    readonly from: LocalDate,
    readonly to: LocalDate | null,
  ) {}

  static of(from: string, to: string | null = null): DateRange {
    const validFrom = assertLocalDate(from, 'La fecha de inicio de vigencia');
    const validTo = to === null ? null : assertLocalDate(to, 'La fecha de fin de vigencia');

    if (validTo !== null && validTo < validFrom) {
      throw new InvalidValueError('El fin de vigencia no puede ser anterior al inicio.', {
        from: validFrom,
        to: validTo,
      });
    }

    return new DateRange(validFrom, validTo);
  }

  /** Vigente desde una fecha, sin fin previsto. */
  static openEnded(from: string): DateRange {
    return DateRange.of(from, null);
  }

  contains(date: string): boolean {
    const d = assertLocalDate(date);
    if (d < this.from) return false;
    if (this.to !== null && d > this.to) return false;
    return true;
  }

  overlaps(other: DateRange): boolean {
    const thisEnd = this.to ?? '9999-12-31';
    const otherEnd = other.to ?? '9999-12-31';
    return this.from <= otherEnd && other.from <= thisEnd;
  }

  isOpenEnded(): boolean {
    return this.to === null;
  }

  toJSON(): { from: LocalDate; to: LocalDate | null } {
    return { from: this.from, to: this.to };
  }

  /**
   * Verifica que una serie de rangos forme una línea de tiempo sin solapamientos.
   *
   * INV-REL-03 e INV-PARAM-04: las condiciones históricas de una relación laboral y
   * las versiones de parámetros tienen que poder resolverse a una sola respuesta para
   * cualquier fecha. Si dos rangos se solapan, la pregunta "¿qué regía el 15 de mayo?"
   * tiene dos respuestas, y una liquidación dejaría de ser reproducible.
   */
  static assertNoOverlap(ranges: readonly DateRange[], entity = 'las vigencias'): void {
    const sorted = [...ranges].sort((a, b) => a.from.localeCompare(b.from));
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1];
      const current = sorted[i];
      if (previous === undefined || current === undefined) continue;
      if (previous.overlaps(current)) {
        throw new InvalidValueError(`Se solapan ${entity}.`, {
          first: previous.toJSON(),
          second: current.toJSON(),
        });
      }
    }
  }

  /** Resuelve qué rango de una serie rige en una fecha dada. */
  static findEffectiveAt<T extends { effectiveRange: DateRange }>(
    items: readonly T[],
    date: string,
  ): T | undefined {
    return items.find((item) => item.effectiveRange.contains(date));
  }
}
