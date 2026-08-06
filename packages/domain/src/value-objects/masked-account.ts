import { InvalidValueError } from '../errors';

export type BankAccountKind = 'CBU' | 'CVU';

/**
 * Representación enmascarada de una cuenta bancaria.
 *
 * **Esta es la única forma en que un CBU o CVU sale del backend.** El valor completo
 * se guarda cifrado a nivel de aplicación y no aparece en respuestas de API, logs,
 * eventos de auditoría ni analítica (INV-PAGO-03, docs/security-model.md §4).
 *
 * El tipo hace cumplir la regla: no hay ningún camino que devuelva el número entero,
 * porque no existe un método que lo exponga.
 */
export class MaskedAccount {
  private constructor(
    readonly kind: BankAccountKind,
    readonly last4: string,
    readonly alias: string | null,
  ) {}

  /**
   * Construye la máscara a partir del número completo. El número **no se retiene**:
   * sólo sobreviven los últimos cuatro dígitos.
   */
  static fromFullNumber(
    fullNumber: string,
    kind: BankAccountKind,
    alias: string | null = null,
  ): MaskedAccount {
    const digits = fullNumber.replace(/\D/g, '');
    if (digits.length !== 22) {
      throw new InvalidValueError('Un CBU o CVU debe tener 22 dígitos.', {
        kind,
        length: digits.length,
      });
    }
    return new MaskedAccount(kind, digits.slice(-4), alias);
  }

  /** Reconstruye la máscara desde lo persistido, sin pasar por el número completo. */
  static fromLast4(kind: BankAccountKind, last4: string, alias: string | null = null): MaskedAccount {
    if (!/^\d{4}$/.test(last4)) {
      throw new InvalidValueError('Los últimos 4 dígitos deben ser exactamente 4 números.', {
        last4Length: last4.length,
      });
    }
    return new MaskedAccount(kind, last4, alias);
  }

  /** `••••••••••••••••••1234` — lo que ve el usuario y lo que va a los logs. */
  toString(): string {
    return `${'•'.repeat(18)}${this.last4}`;
  }

  toJSON(): { kind: BankAccountKind; last4: string; alias: string | null; masked: string } {
    return { kind: this.kind, last4: this.last4, alias: this.alias, masked: this.toString() };
  }
}

/**
 * Valida el dígito verificador de un CBU/CVU argentino.
 *
 * Un CBU son 22 dígitos en dos bloques: 8 (entidad + sucursal + verificador) y 14
 * (cuenta + verificador). Cada bloque tiene su propio dígito de control con pesos
 * distintos. Se valida en el borde, antes de cifrar y guardar, para que un error de
 * tipeo no llegue al momento de la transferencia.
 */
export function isValidCbuFormat(fullNumber: string): boolean {
  const digits = fullNumber.replace(/\D/g, '');
  if (digits.length !== 22) return false;

  const checkBlock = (block: string, weights: readonly number[]): boolean => {
    const body = block.slice(0, -1);
    const checkDigit = Number(block.slice(-1));
    let sum = 0;
    for (let i = 0; i < body.length; i += 1) {
      sum += Number(body[i]) * (weights[i] ?? 0);
    }
    return (10 - (sum % 10)) % 10 === checkDigit;
  };

  return (
    checkBlock(digits.slice(0, 8), [7, 1, 3, 9, 7, 1, 3]) &&
    checkBlock(digits.slice(8), [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3])
  );
}
