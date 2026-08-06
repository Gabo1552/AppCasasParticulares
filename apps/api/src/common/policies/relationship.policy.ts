import { PlatformRole } from '@casas/domain';

/**
 * Permisos por objeto sobre una relación laboral.
 *
 * Es la capa 2 de autorización. SEG-03 lo dice sin ambigüedad: "un usuario no accede
 * a relaciones no vinculadas". Tener el rol `ACCOUNTANT` no da acceso a ninguna
 * relación; lo da una asignación profesional activa sobre **esa** relación (RN-11).
 *
 * Se evalúa siempre en el backend, aunque la interfaz oculte la acción (sección 14.1
 * del documento).
 */

export const AccessLevel = {
  NONE: 'NONE',
  READ: 'READ',
  WRITE: 'WRITE',
} as const;
export type AccessLevel = (typeof AccessLevel)[keyof typeof AccessLevel];

export interface RelationshipAccessContext {
  readonly actorUserId: string;
  readonly actorRole: PlatformRole;
  /** Ids de las partes de la relación consultada. */
  readonly relationship: {
    readonly id: string;
    readonly employerUserId: string;
    readonly workerUserId: string | null;
    readonly accountingFirmId: string | null;
  };
  /** Asignación profesional activa del actor sobre esta relación, si existe. */
  readonly hasActiveProfessionalAssignment: boolean;
  /** Estudio contable del actor, cuando es ACCOUNTANT_MANAGER. */
  readonly actorAccountingFirmId: string | null;
  /** Ticket de soporte abierto vinculado a esta relación (SUP-01). */
  readonly hasLinkedSupportTicket: boolean;
  /** Acceso administrativo excepcional vigente, con motivo y expiración (13.1). */
  readonly hasActiveBreakGlassAccess: boolean;
}

export interface AccessDecision {
  readonly level: AccessLevel;
  readonly reason: string;
  /** `true` si la lectura debe generar un evento de auditoría específico. */
  readonly requiresAuditOnRead: boolean;
}

/**
 * Resuelve qué puede hacer un actor sobre una relación laboral concreta.
 *
 * Devuelve una decisión explicada en lugar de un booleano: el motivo se usa en el
 * mensaje de error y, cuando corresponde, en el evento de auditoría.
 */
export function resolveRelationshipAccess(context: RelationshipAccessContext): AccessDecision {
  const { actorRole, actorUserId, relationship } = context;

  switch (actorRole) {
    case PlatformRole.FAMILY_EMPLOYER:
      return relationship.employerUserId === actorUserId
        ? {
            level: AccessLevel.WRITE,
            reason: 'Es la familia empleadora de la relación.',
            requiresAuditOnRead: false,
          }
        : deny('El usuario no es la familia empleadora de esta relación.');

    case PlatformRole.WORKER:
      // La trabajadora ve su relación y ficha, pero no edita condiciones ni aprueba
      // jornadas: eso es una decisión de la empleadora (matriz de permisos, §4.1).
      return relationship.workerUserId === actorUserId
        ? {
            level: AccessLevel.READ,
            reason: 'Es la trabajadora de la relación.',
            requiresAuditOnRead: false,
          }
        : deny('El usuario no es la trabajadora de esta relación.');

    case PlatformRole.ACCOUNTANT:
      return context.hasActiveProfessionalAssignment
        ? {
            level: AccessLevel.WRITE,
            reason: 'Tiene una asignación profesional activa sobre la relación.',
            requiresAuditOnRead: false,
          }
        : deny(
            'El contador no tiene una asignación profesional activa sobre esta relación (RN-11). ' +
              'El rol por sí solo no otorga acceso.',
          );

    case PlatformRole.ACCOUNTANT_MANAGER:
      if (context.hasActiveProfessionalAssignment) {
        return {
          level: AccessLevel.WRITE,
          reason: 'Tiene una asignación profesional activa sobre la relación.',
          requiresAuditOnRead: false,
        };
      }
      // El responsable del estudio ve la cartera para reasignar por capacidad
      // (CON-05, CON-13), pero sólo dentro de su propio estudio.
      if (
        context.actorAccountingFirmId !== null &&
        context.actorAccountingFirmId === relationship.accountingFirmId
      ) {
        return {
          level: AccessLevel.READ,
          reason: 'La relación pertenece a la cartera de su estudio contable.',
          requiresAuditOnRead: true,
        };
      }
      return deny('La relación no pertenece a la cartera de su estudio contable.');

    case PlatformRole.SUPPORT_AGENT:
      return context.hasLinkedSupportTicket
        ? {
            level: AccessLevel.READ,
            reason: 'Existe un ticket de soporte abierto vinculado a la relación.',
            requiresAuditOnRead: true,
          }
        : deny('Soporte sólo accede a una relación con un ticket abierto que la vincule (SUP-01).');

    case PlatformRole.OPERATIONS_AGENT:
      return {
        level: AccessLevel.READ,
        reason: 'Acceso operativo de sólo lectura.',
        requiresAuditOnRead: true,
      };

    case PlatformRole.PLATFORM_ADMIN:
      // El acceso administrativo a una relación concreta no es libre: exige un
      // acceso excepcional vigente, con motivo y expiración, y se audita cada
      // lectura (sección 13.1 del documento).
      return context.hasActiveBreakGlassAccess
        ? {
            level: AccessLevel.READ,
            reason: 'Acceso administrativo excepcional vigente.',
            requiresAuditOnRead: true,
          }
        : deny(
            'El acceso administrativo a una relación exige abrir un acceso excepcional ' +
              'con motivo y vencimiento (13.1).',
          );

    case PlatformRole.SYSTEM:
      return {
        level: AccessLevel.WRITE,
        reason: 'Proceso del sistema.',
        requiresAuditOnRead: false,
      };

    default:
      return deny('Rol no reconocido.');
  }
}

function deny(reason: string): AccessDecision {
  return { level: AccessLevel.NONE, reason, requiresAuditOnRead: false };
}

export function canRead(decision: AccessDecision): boolean {
  return decision.level === AccessLevel.READ || decision.level === AccessLevel.WRITE;
}

export function canWrite(decision: AccessDecision): boolean {
  return decision.level === AccessLevel.WRITE;
}
