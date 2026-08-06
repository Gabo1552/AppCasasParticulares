import { PlatformRole } from '../roles';
import { StateMachine, type TransitionDefinition } from './state-machine';

/** Estados de una relación laboral (docs/domain-model.md §4.1). */
export const EmploymentRelationshipStatus = {
  DRAFT: 'DRAFT',
  PENDING_WORKER_ACCEPTANCE: 'PENDING_WORKER_ACCEPTANCE',
  PENDING_CONFIGURATION: 'PENDING_CONFIGURATION',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  TERMINATED: 'TERMINATED',
  ARCHIVED: 'ARCHIVED',
} as const;

export type EmploymentRelationshipStatus =
  (typeof EmploymentRelationshipStatus)[keyof typeof EmploymentRelationshipStatus];

/** Datos que las guardas de esta máquina consultan. */
export interface RelationshipTransitionPayload {
  readonly hasHousehold?: boolean;
  readonly hasWorkerAcceptance?: boolean;
  readonly hasEffectiveTerms?: boolean;
  readonly hasPublishedSchedule?: boolean;
  readonly hasOpenPayrollPeriods?: boolean;
  readonly hasDossierExport?: boolean;
  readonly reason?: string;
  readonly terminationDate?: string;
}

const S = EmploymentRelationshipStatus;

function payloadOf(context: {
  payload?: Readonly<Record<string, unknown>>;
}): RelationshipTransitionPayload {
  return (context.payload ?? {}) as RelationshipTransitionPayload;
}

function requireReason(context: { payload?: Readonly<Record<string, unknown>> }): true | string {
  const reason = payloadOf(context).reason;
  return typeof reason === 'string' && reason.trim().length > 0
    ? true
    : 'la operación exige un motivo explícito, que queda en la auditoría';
}

const transitions: readonly TransitionDefinition<EmploymentRelationshipStatus>[] = [
  {
    from: S.DRAFT,
    to: S.PENDING_CONFIGURATION,
    allowedRoles: [PlatformRole.FAMILY_EMPLOYER, PlatformRole.SYSTEM],
    description: 'La trabajadora aceptó la invitación y la relación queda por configurar',
    guard: (context) =>
      payloadOf(context).hasHousehold === true
        ? true
        : 'no puede existir una relación sin domicilio laboral (REL-02)',
  },
  {
    from: S.PENDING_CONFIGURATION,
    to: S.PENDING_WORKER_ACCEPTANCE,
    allowedRoles: [PlatformRole.FAMILY_EMPLOYER],
    description: 'La familia envía las condiciones a la trabajadora para su aceptación',
    // INV-REL-04: enviar sin condiciones vigentes o sin calendario dejaría al motor
    // de liquidación sin base de cálculo y al fichaje sin jornadas esperadas.
    guard: (context) => {
      const p = payloadOf(context);
      if (p.hasEffectiveTerms !== true) {
        return 'faltan condiciones vigentes: categoría, modalidad, esquema y remuneración (REL-02)';
      }
      if (p.hasPublishedSchedule !== true) {
        return 'falta publicar el horario previsto, que genera las jornadas esperadas (REL-04)';
      }
      return true;
    },
  },
  {
    from: S.PENDING_WORKER_ACCEPTANCE,
    to: S.ACTIVE,
    allowedRoles: [PlatformRole.WORKER],
    description: 'La trabajadora acepta las condiciones y la relación queda activa (REL-08)',
    // El único camino a ACTIVE pasa por acá: la familia no puede activar sola
    // (ADR 0002). La aceptación se registra con versión, usuario, fecha y evidencia.
    guard: (context) =>
      payloadOf(context).hasWorkerAcceptance === true
        ? true
        : 'la aceptación debe registrarse con versión, usuario, fecha y evidencia (REL-08)',
  },
  {
    from: S.PENDING_WORKER_ACCEPTANCE,
    to: S.PENDING_CONFIGURATION,
    allowedRoles: [PlatformRole.WORKER, PlatformRole.FAMILY_EMPLOYER],
    description: 'La trabajadora rechaza las condiciones, o la familia las retira para corregirlas',
    guard: requireReason,
  },
  {
    from: S.ACTIVE,
    to: S.SUSPENDED,
    allowedRoles: [PlatformRole.FAMILY_EMPLOYER],
    description: 'La familia suspende la relación (REL-07)',
    guard: requireReason,
  },
  {
    from: S.SUSPENDED,
    to: S.ACTIVE,
    allowedRoles: [PlatformRole.FAMILY_EMPLOYER],
    description: 'La familia reactiva la relación',
  },
  {
    from: S.ACTIVE,
    to: S.TERMINATED,
    allowedRoles: [PlatformRole.FAMILY_EMPLOYER],
    description: 'Baja de la relación laboral (REL-07)',
    guard: (context) => {
      const p = payloadOf(context);
      const reasonCheck = requireReason(context);
      if (reasonCheck !== true) return reasonCheck;
      if (typeof p.terminationDate !== 'string' || p.terminationDate.length === 0) {
        return 'la baja exige fecha de finalización (REL-07)';
      }
      return true;
    },
  },
  {
    from: S.SUSPENDED,
    to: S.TERMINATED,
    allowedRoles: [PlatformRole.FAMILY_EMPLOYER],
    description: 'Baja desde una relación suspendida (REL-07)',
    guard: (context) => {
      const p = payloadOf(context);
      const reasonCheck = requireReason(context);
      if (reasonCheck !== true) return reasonCheck;
      if (typeof p.terminationDate !== 'string' || p.terminationDate.length === 0) {
        return 'la baja exige fecha de finalización (REL-07)';
      }
      return true;
    },
  },
  {
    from: S.TERMINATED,
    to: S.ARCHIVED,
    allowedRoles: [PlatformRole.PLATFORM_ADMIN, PlatformRole.SYSTEM],
    description: 'Cierre documental de la relación (REL-07)',
    // No se archiva con un período abierto: quedaría una liquidación sin dueño.
    guard: (context) => {
      const p = payloadOf(context);
      if (p.hasOpenPayrollPeriods === true) {
        return 'no se puede archivar con períodos de liquidación abiertos';
      }
      if (p.hasDossierExport !== true) {
        return 'el cierre documental exige la exportación final del legajo (REL-07, DOC-05)';
      }
      return true;
    },
  },
  {
    from: S.DRAFT,
    to: S.ARCHIVED,
    allowedRoles: [PlatformRole.FAMILY_EMPLOYER],
    description: 'La familia cancela un borrador antes de invitar',
  },
];

/**
 * No hay transición desde `ARCHIVED`, y no hay borrado físico en ningún estado:
 * el encargo lo prohíbe para relaciones laborales (INV-REL-05).
 */
export const employmentRelationshipStateMachine = new StateMachine<EmploymentRelationshipStatus>(
  'EmploymentRelationship',
  transitions,
  [S.ARCHIVED],
);
