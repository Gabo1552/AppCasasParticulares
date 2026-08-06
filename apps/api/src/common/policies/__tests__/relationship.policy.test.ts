import { PlatformRole } from '@casas/domain';
import { describe, expect, it } from 'vitest';
import {
  AccessLevel,
  canRead,
  canWrite,
  resolveRelationshipAccess,
  type RelationshipAccessContext,
} from '../relationship.policy';

const EMPLOYER_USER = 'user-employer';
const WORKER_USER = 'user-worker';
const OTHER_USER = 'user-otro';

function context(overrides: Partial<RelationshipAccessContext> = {}): RelationshipAccessContext {
  return {
    actorUserId: OTHER_USER,
    actorRole: PlatformRole.FAMILY_EMPLOYER,
    relationship: {
      id: 'rel-1',
      employerUserId: EMPLOYER_USER,
      workerUserId: WORKER_USER,
      accountingFirmId: 'firm-1',
    },
    hasActiveProfessionalAssignment: false,
    actorAccountingFirmId: null,
    hasLinkedSupportTicket: false,
    hasActiveBreakGlassAccess: false,
    ...overrides,
  };
}

describe('Permisos por objeto sobre la relación laboral (SEG-03)', () => {
  describe('familia empleadora', () => {
    it('escribe sobre su propia relación', () => {
      const decision = resolveRelationshipAccess(
        context({ actorRole: PlatformRole.FAMILY_EMPLOYER, actorUserId: EMPLOYER_USER }),
      );
      expect(canWrite(decision)).toBe(true);
    });

    it('no accede a la relación de otra familia', () => {
      const decision = resolveRelationshipAccess(
        context({ actorRole: PlatformRole.FAMILY_EMPLOYER, actorUserId: OTHER_USER }),
      );
      expect(decision.level).toBe(AccessLevel.NONE);
      expect(canRead(decision)).toBe(false);
    });
  });

  describe('trabajadora', () => {
    it('lee su propia relación pero no la modifica', () => {
      const decision = resolveRelationshipAccess(
        context({ actorRole: PlatformRole.WORKER, actorUserId: WORKER_USER }),
      );
      expect(canRead(decision)).toBe(true);
      expect(canWrite(decision)).toBe(false);
    });

    it('no accede a la relación de otra trabajadora', () => {
      const decision = resolveRelationshipAccess(
        context({ actorRole: PlatformRole.WORKER, actorUserId: OTHER_USER }),
      );
      expect(canRead(decision)).toBe(false);
    });
  });

  describe('contador', () => {
    it('el rol por sí solo NO da acceso: hace falta asignación activa (RN-11)', () => {
      const decision = resolveRelationshipAccess(
        context({ actorRole: PlatformRole.ACCOUNTANT, hasActiveProfessionalAssignment: false }),
      );

      expect(decision.level).toBe(AccessLevel.NONE);
      expect(decision.reason).toContain('El rol por sí solo no otorga acceso');
    });

    it('con asignación activa puede operar la relación', () => {
      const decision = resolveRelationshipAccess(
        context({ actorRole: PlatformRole.ACCOUNTANT, hasActiveProfessionalAssignment: true }),
      );
      expect(canWrite(decision)).toBe(true);
    });
  });

  describe('responsable de estudio', () => {
    it('lee la cartera de su propio estudio, con auditoría', () => {
      const decision = resolveRelationshipAccess(
        context({
          actorRole: PlatformRole.ACCOUNTANT_MANAGER,
          actorAccountingFirmId: 'firm-1',
        }),
      );

      expect(decision.level).toBe(AccessLevel.READ);
      expect(decision.requiresAuditOnRead).toBe(true);
    });

    it('no accede a la cartera de otro estudio', () => {
      const decision = resolveRelationshipAccess(
        context({
          actorRole: PlatformRole.ACCOUNTANT_MANAGER,
          actorAccountingFirmId: 'firm-2',
        }),
      );
      expect(canRead(decision)).toBe(false);
    });
  });

  describe('soporte', () => {
    it('sin ticket vinculado no accede', () => {
      const decision = resolveRelationshipAccess(
        context({ actorRole: PlatformRole.SUPPORT_AGENT, hasLinkedSupportTicket: false }),
      );
      expect(canRead(decision)).toBe(false);
    });

    it('con ticket vinculado accede sólo en lectura y auditado', () => {
      const decision = resolveRelationshipAccess(
        context({ actorRole: PlatformRole.SUPPORT_AGENT, hasLinkedSupportTicket: true }),
      );

      expect(decision.level).toBe(AccessLevel.READ);
      expect(canWrite(decision)).toBe(false);
      expect(decision.requiresAuditOnRead).toBe(true);
    });
  });

  describe('administrador de plataforma', () => {
    it('no accede a una relación sin acceso excepcional vigente (13.1)', () => {
      const decision = resolveRelationshipAccess(
        context({ actorRole: PlatformRole.PLATFORM_ADMIN, hasActiveBreakGlassAccess: false }),
      );

      expect(decision.level).toBe(AccessLevel.NONE);
      expect(decision.reason).toContain('motivo y vencimiento');
    });

    it('con acceso excepcional lee, sin escribir, y cada lectura se audita', () => {
      const decision = resolveRelationshipAccess(
        context({ actorRole: PlatformRole.PLATFORM_ADMIN, hasActiveBreakGlassAccess: true }),
      );

      expect(decision.level).toBe(AccessLevel.READ);
      expect(canWrite(decision)).toBe(false);
      expect(decision.requiresAuditOnRead).toBe(true);
    });
  });

  it('ningún rol interno puede escribir sobre una relación laboral', () => {
    const internalRoles = [
      PlatformRole.OPERATIONS_AGENT,
      PlatformRole.SUPPORT_AGENT,
      PlatformRole.PLATFORM_ADMIN,
    ];

    for (const role of internalRoles) {
      const decision = resolveRelationshipAccess(
        context({
          actorRole: role,
          hasLinkedSupportTicket: true,
          hasActiveBreakGlassAccess: true,
        }),
      );
      expect(canWrite(decision), `${role} no debería poder escribir`).toBe(false);
    }
  });
});
