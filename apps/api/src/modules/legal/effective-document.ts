import type { ConsentDocumentStatus, ConsentKind, Prisma } from '@casas/database';

/**
 * Qué hace vigente a un texto legal.
 *
 * Tres condiciones, todas explícitas en columnas: aprobado, con fecha de vigencia
 * cargada, y esa fecha ya pasada. Antes bastaba con que la cadena `version`
 * contuviera la palabra "approved", lo que dejaba el cumplimiento legal en manos
 * de una convención de nombres que nadie verificaba.
 *
 * Un documento `RETIRED` nunca es vigente, y uno `APPROVED` con `effectiveFrom`
 * futuro tampoco: está aprobado, pero todavía no rige.
 */
export const APPROVED: ConsentDocumentStatus = 'APPROVED';

export function effectiveDocumentWhere(
  kind: ConsentKind,
  now: Date = new Date(),
): Prisma.ConsentDocumentWhereInput {
  return {
    kind,
    status: APPROVED,
    effectiveFrom: { not: null, lte: now },
  };
}
