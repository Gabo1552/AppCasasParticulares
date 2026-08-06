/**
 * @casas/database — cliente Prisma y utilidades de acceso a datos.
 *
 * Es el único paquete que conoce el esquema físico. Los módulos de la API lo
 * consumen a través de sus repositorios; el dominio y el motor de liquidación
 * no lo tocan (ADR 0001, decisión D3).
 */

import { Prisma, PrismaClient } from '@prisma/client';

export { Prisma, PrismaClient };
export * from '@prisma/client';

/**
 * Convierte un importe decimal a string, que es como viaja por la API.
 *
 * Deliberadamente **no** hay una función que devuelva `number`: JSON no tiene
 * decimal exacto y convertir a `number` reintroduciría el error binario que se
 * evita en todo el resto de la cadena (RN-13, docs/architecture.md §7).
 */
export function decimalToString(value: Prisma.Decimal | null | undefined): string | null {
  return value == null ? null : value.toFixed();
}

export function toPrismaDecimal(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

/** Cliente Prisma con logging acorde al entorno. */
export function createPrismaClient(options?: { logQueries?: boolean }): PrismaClient {
  return new PrismaClient({
    log: options?.logQueries === true ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });
}

/**
 * Error de conflicto de concurrencia optimista.
 *
 * Se lanza cuando un `updateMany` con `version` no afectó ninguna fila: otro actor
 * modificó el registro mientras tanto. La capa HTTP lo mapea a 409 (decisión D11).
 */
export class OptimisticLockError extends Error {
  readonly code = 'OPTIMISTIC_LOCK_CONFLICT';

  constructor(
    readonly entity: string,
    readonly id: string,
    readonly expectedVersion: number,
  ) {
    super(
      `${entity} ${id} fue modificado por otra operación (se esperaba la versión ${expectedVersion}). ` +
        'Recargá los datos y reintentá.',
    );
    this.name = 'OptimisticLockError';
  }
}

/**
 * Aplica un update con control de concurrencia optimista.
 *
 * Incrementa `version` y exige que la versión actual coincida con la esperada.
 * Si no coincide, nadie pisa el trabajo del otro: se lanza y el cliente decide.
 */
export async function updateWithVersion<T>(
  operation: (expectedVersion: number) => Promise<{ count: number }>,
  reload: () => Promise<T>,
  entity: string,
  id: string,
  expectedVersion: number,
): Promise<T> {
  const result = await operation(expectedVersion);
  if (result.count === 0) {
    throw new OptimisticLockError(entity, id, expectedVersion);
  }
  return reload();
}
