import { PlatformRole } from '../roles';
import { StateMachine, type TransitionDefinition } from './state-machine';

/** Estados de un fichaje (docs/domain-model.md §4.3). */
export const TimeEntryStatus = {
  /** Registrado en el dispositivo, todavía no sincronizado (FIC-03). */
  PENDING_SYNC: 'PENDING_SYNC',
  RECORDED: 'RECORDED',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  DISPUTED: 'DISPUTED',
  CORRECTED: 'CORRECTED',
  REJECTED: 'REJECTED',
} as const;

export type TimeEntryStatus = (typeof TimeEntryStatus)[keyof typeof TimeEntryStatus];

/** Métodos de validación admitidos en el MVP (FIC-02). */
export const TimeEntryMethod = {
  BUTTON: 'BUTTON',
  QR: 'QR',
  PIN: 'PIN',
  PROXIMITY: 'PROXIMITY',
  /** Carga manual autorizada, siempre con motivo y aprobación. */
  MANUAL: 'MANUAL',
} as const;

export type TimeEntryMethod = (typeof TimeEntryMethod)[keyof typeof TimeEntryMethod];

export const TimeEntryKind = {
  CLOCK_IN: 'CLOCK_IN',
  CLOCK_OUT: 'CLOCK_OUT',
  BREAK_START: 'BREAK_START',
  BREAK_END: 'BREAK_END',
} as const;

export type TimeEntryKind = (typeof TimeEntryKind)[keyof typeof TimeEntryKind];

export interface TimeEntryTransitionPayload {
  readonly hasApprovedCorrection?: boolean;
  readonly periodLocked?: boolean;
  readonly reason?: string;
}

const S = TimeEntryStatus;

function payloadOf(context: {
  payload?: Readonly<Record<string, unknown>>;
}): TimeEntryTransitionPayload {
  return (context.payload ?? {}) as TimeEntryTransitionPayload;
}

function requireReason(context: { payload?: Readonly<Record<string, unknown>> }): true | string {
  const reason = payloadOf(context).reason;
  return typeof reason === 'string' && reason.trim().length > 0
    ? true
    : 'la operación exige un motivo explícito, que queda en la auditoría';
}

/**
 * El período bloqueado detiene cualquier cambio de asistencia (INV-TIME-05).
 * Reabrirlo es una operación auditada, no un efecto lateral de editar un fichaje.
 */
function periodNotLocked(context: { payload?: Readonly<Record<string, unknown>> }): true | string {
  return payloadOf(context).periodLocked === true
    ? 'el período está bloqueado; modificar la asistencia exige una reapertura auditada (FIC-07)'
    : true;
}

const transitions: readonly TransitionDefinition<TimeEntryStatus>[] = [
  {
    from: S.PENDING_SYNC,
    to: S.RECORDED,
    allowedRoles: [PlatformRole.SYSTEM],
    description: 'El servidor recibe el fichaje offline y lo deduplica por idempotencia (FIC-03)',
  },
  {
    from: S.RECORDED,
    to: S.PENDING_APPROVAL,
    allowedRoles: [PlatformRole.SYSTEM, PlatformRole.FAMILY_EMPLOYER],
    description: 'El cierre de asistencia del período envía el fichaje a aprobación (FIC-07)',
  },
  {
    from: S.PENDING_APPROVAL,
    to: S.APPROVED,
    allowedRoles: [PlatformRole.FAMILY_EMPLOYER],
    description: 'La familia aprueba la jornada (FIC-07)',
    guard: periodNotLocked,
  },
  {
    from: S.PENDING_APPROVAL,
    to: S.REJECTED,
    allowedRoles: [PlatformRole.FAMILY_EMPLOYER],
    description: 'La familia rechaza el fichaje',
    guard: (context) => {
      const locked = periodNotLocked(context);
      if (locked !== true) return locked;
      return requireReason(context);
    },
  },

  // Cualquiera de las dos partes puede objetar. El fichaje original nunca se borra:
  // la objeción abre una discusión, no reescribe el hecho (FIC-06, INV-TIME-04).
  ...([S.RECORDED, S.PENDING_APPROVAL, S.APPROVED] as const).map(
    (from): TransitionDefinition<TimeEntryStatus> => ({
      from,
      to: S.DISPUTED,
      allowedRoles: [PlatformRole.WORKER, PlatformRole.FAMILY_EMPLOYER],
      description: 'Se objeta el fichaje y se solicita corrección (FIC-06)',
      guard: requireReason,
    }),
  ),

  {
    from: S.DISPUTED,
    to: S.CORRECTED,
    allowedRoles: [PlatformRole.FAMILY_EMPLOYER],
    description: 'La familia aprueba la corrección; se crea un fichaje nuevo que apunta a este',
    guard: (context) => {
      const locked = periodNotLocked(context);
      if (locked !== true) return locked;
      return payloadOf(context).hasApprovedCorrection === true
        ? true
        : 'no hay una solicitud de corrección aprobada asociada (FIC-06)';
    },
  },
  {
    from: S.DISPUTED,
    to: S.APPROVED,
    allowedRoles: [PlatformRole.FAMILY_EMPLOYER],
    description:
      'La familia rechaza la objeción; el fichaje original queda aprobado y la objeción registrada',
    guard: (context) => {
      const locked = periodNotLocked(context);
      if (locked !== true) return locked;
      return requireReason(context);
    },
  },
];

/**
 * `CORRECTED` y `REJECTED` son terminales para *este* registro. Una corrección no
 * edita el fichaje: crea uno nuevo con `correctsTimeEntryId` apuntando al original,
 * que queda archivado como evidencia (FIC-06: "la corrección nunca borra el original").
 */
export const timeEntryStateMachine = new StateMachine<TimeEntryStatus>('TimeEntry', transitions, [
  S.CORRECTED,
  S.REJECTED,
]);
