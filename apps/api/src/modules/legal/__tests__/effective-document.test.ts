import { describe, expect, it } from 'vitest';
import { effectiveDocumentWhere } from '../effective-document';

/**
 * Vigencia de un texto legal.
 *
 * Antes se resolvía con `version: { contains: 'approved' }`: un documento contaba
 * como aprobado porque alguien había escrito esa palabra en el campo de versión.
 * Cualquier borrador llamado "v2-approved-draft" pasaba el control, y un
 * documento realmente aprobado llamado "v3" no lo pasaba.
 */
describe('Criterio de documento legal vigente', () => {
  const ahora = new Date('2026-08-07T12:00:00Z');

  it('exige status APPROVED, no una subcadena de la versión', () => {
    const where = effectiveDocumentWhere('TERMS_OF_SERVICE', ahora);

    expect(where.status).toBe('APPROVED');
    expect(JSON.stringify(where)).not.toContain('contains');
  });

  it('exige que effectiveFrom exista y ya haya pasado', () => {
    const where = effectiveDocumentWhere('PRIVACY_POLICY', ahora);

    expect(where.effectiveFrom).toEqual({ not: null, lte: ahora });
  });

  it('filtra por el tipo pedido', () => {
    expect(effectiveDocumentWhere('TERMS_OF_SERVICE', ahora).kind).toBe('TERMS_OF_SERVICE');
    expect(effectiveDocumentWhere('PRIVACY_POLICY', ahora).kind).toBe('PRIVACY_POLICY');
  });

  /**
   * Estas cuatro comprobaciones evalúan el criterio contra filas de ejemplo. La
   * consulta real contra PostgreSQL la cubre la prueba de integración; acá se
   * verifica que la regla, aplicada a cada estado, dé el resultado esperado.
   */
  describe('qué califica como vigente', () => {
    const matches = (
      doc: { status: string; effectiveFrom: Date | null },
      where: ReturnType<typeof effectiveDocumentWhere>,
    ): boolean => {
      const cond = where.effectiveFrom as { not: null; lte: Date };
      return (
        doc.status === where.status &&
        doc.effectiveFrom !== null &&
        doc.effectiveFrom.getTime() <= cond.lte.getTime()
      );
    };

    const where = effectiveDocumentWhere('TERMS_OF_SERVICE', ahora);

    it('un borrador no es vigente', () => {
      expect(matches({ status: 'DRAFT', effectiveFrom: null }, where)).toBe(false);
    });

    it('un documento en revisión no es vigente', () => {
      expect(
        matches({ status: 'UNDER_REVIEW', effectiveFrom: new Date('2026-01-01') }, where),
      ).toBe(false);
    });

    it('un aprobado con vigencia cumplida es vigente', () => {
      expect(matches({ status: 'APPROVED', effectiveFrom: new Date('2026-01-01') }, where)).toBe(
        true,
      );
    });

    it('un aprobado con vigencia futura todavía no rige', () => {
      expect(matches({ status: 'APPROVED', effectiveFrom: new Date('2027-01-01') }, where)).toBe(
        false,
      );
    });

    it('un aprobado sin fecha de vigencia no rige', () => {
      expect(matches({ status: 'APPROVED', effectiveFrom: null }, where)).toBe(false);
    });

    it('un documento retirado no es vigente', () => {
      expect(matches({ status: 'RETIRED', effectiveFrom: new Date('2026-01-01') }, where)).toBe(
        false,
      );
    });
  });
});
