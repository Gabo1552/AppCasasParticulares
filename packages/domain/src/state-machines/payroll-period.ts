import { PlatformRole } from '../roles';
import { StateMachine, type TransitionDefinition } from './state-machine';

/** Estados de un período mensual de liquidación (docs/domain-model.md §4.2). */
export const PayrollPeriodStatus = {
  OPEN: 'OPEN',
  PENDING_ATTENDANCE_APPROVAL: 'PENDING_ATTENDANCE_APPROVAL',
  READY_FOR_CALCULATION: 'READY_FOR_CALCULATION',
  CALCULATED: 'CALCULATED',
  PENDING_PROFESSIONAL_REVIEW: 'PENDING_PROFESSIONAL_REVIEW',
  OBSERVED: 'OBSERVED',
  APPROVED: 'APPROVED',
  PENDING_ARCA: 'PENDING_ARCA',
  ARCA_DOCUMENT_IMPORTED: 'ARCA_DOCUMENT_IMPORTED',
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAID: 'PAID',
  RECONCILED: 'RECONCILED',
  RECTIFICATION_REQUIRED: 'RECTIFICATION_REQUIRED',
  CLOSED: 'CLOSED',
} as const;

export type PayrollPeriodStatus =
  (typeof PayrollPeriodStatus)[keyof typeof PayrollPeriodStatus];

export interface PayrollPeriodTransitionPayload {
  readonly allAttendanceApproved?: boolean;
  readonly hasBlockingErrors?: boolean;
  readonly requiresProfessionalReview?: boolean;
  readonly hasCalculation?: boolean;
  readonly hasImportedReceipt?: boolean;
  readonly hasOpenDifferences?: boolean;
  readonly hasRegisteredPayment?: boolean;
  readonly reason?: string;
  readonly observations?: readonly string[];
}

const S = PayrollPeriodStatus;

function payloadOf(context: {
  payload?: Readonly<Record<string, unknown>>;
}): PayrollPeriodTransitionPayload {
  return (context.payload ?? {}) as PayrollPeriodTransitionPayload;
}

/**
 * INV-PAY-04: ninguna transición hacia adelante ocurre con errores bloqueantes
 * pendientes. Es la traducción de RN-07 y LIQ-10 — por ejemplo, una remuneración
 * pactada por debajo del mínimo vigente detiene el período hasta que alguien
 * autorizado la resuelva.
 */
function noBlockingErrors(context: {
  payload?: Readonly<Record<string, unknown>>;
}): true | string {
  return payloadOf(context).hasBlockingErrors === true
    ? 'el cálculo tiene errores bloqueantes sin resolver (LIQ-10, RN-07)'
    : true;
}

function requireReason(context: {
  payload?: Readonly<Record<string, unknown>>;
}): true | string {
  const reason = payloadOf(context).reason;
  return typeof reason === 'string' && reason.trim().length > 0
    ? true
    : 'la operación exige un motivo explícito, que queda en la auditoría';
}

const transitions: readonly TransitionDefinition<PayrollPeriodStatus>[] = [
  {
    from: S.OPEN,
    to: S.PENDING_ATTENDANCE_APPROVAL,
    allowedRoles: [PlatformRole.FAMILY_EMPLOYER, PlatformRole.SYSTEM],
    description: 'Se cierra la carga de asistencia del período',
  },
  {
    from: S.PENDING_ATTENDANCE_APPROVAL,
    to: S.READY_FOR_CALCULATION,
    allowedRoles: [PlatformRole.FAMILY_EMPLOYER],
    description: 'La familia aprueba las jornadas del período (FIC-07)',
    guard: (context) =>
      payloadOf(context).allAttendanceApproved === true
        ? true
        : 'quedan jornadas sin aprobar, objetadas o con corrección pendiente (FIC-07, FIC-08)',
  },
  {
    from: S.READY_FOR_CALCULATION,
    to: S.CALCULATED,
    allowedRoles: [PlatformRole.FAMILY_EMPLOYER, PlatformRole.ACCOUNTANT, PlatformRole.SYSTEM],
    description: 'El motor genera la preliquidación (LIQ-11)',
    guard: (context) =>
      payloadOf(context).hasCalculation === true
        ? true
        : 'no hay un resultado de cálculo asociado al período',
  },
  {
    from: S.CALCULATED,
    to: S.PENDING_PROFESSIONAL_REVIEW,
    allowedRoles: [PlatformRole.FAMILY_EMPLOYER, PlatformRole.SYSTEM],
    description: 'El período se envía a revisión profesional (CON-06)',
    guard: (context) =>
      payloadOf(context).requiresProfessionalReview === true
        ? true
        : 'la relación no tiene revisión profesional habilitada en su plan (OD-20)',
  },
  {
    from: S.CALCULATED,
    to: S.APPROVED,
    allowedRoles: [PlatformRole.FAMILY_EMPLOYER],
    description: 'La familia aprueba la preliquidación sin revisión profesional (LIQ-12)',
    guard: noBlockingErrors,
  },
  {
    from: S.PENDING_PROFESSIONAL_REVIEW,
    to: S.OBSERVED,
    allowedRoles: [PlatformRole.ACCOUNTANT, PlatformRole.ACCOUNTANT_MANAGER],
    description: 'El contador observa la liquidación y la devuelve (CON-06, CON-08)',
    guard: (context) => {
      const observations = payloadOf(context).observations;
      return observations !== undefined && observations.length > 0
        ? true
        : 'una devolución exige al menos una observación registrada (CON-06)';
    },
  },
  {
    from: S.PENDING_PROFESSIONAL_REVIEW,
    to: S.APPROVED,
    allowedRoles: [PlatformRole.ACCOUNTANT, PlatformRole.ACCOUNTANT_MANAGER],
    description: 'El contador aprueba técnicamente la liquidación (CON-06)',
    guard: noBlockingErrors,
  },
  {
    from: S.OBSERVED,
    to: S.READY_FOR_CALCULATION,
    allowedRoles: [PlatformRole.FAMILY_EMPLOYER],
    description: 'La familia resuelve las observaciones y se recalcula',
  },
  {
    from: S.APPROVED,
    to: S.PENDING_ARCA,
    allowedRoles: [PlatformRole.FAMILY_EMPLOYER, PlatformRole.ACCOUNTANT, PlatformRole.SYSTEM],
    description: 'Se genera la tarea ARCA asistida (ARC-01, ARC-04)',
  },
  {
    from: S.PENDING_ARCA,
    to: S.ARCA_DOCUMENT_IMPORTED,
    allowedRoles: [PlatformRole.FAMILY_EMPLOYER, PlatformRole.ACCOUNTANT],
    description: 'Se importa el recibo oficial emitido en ARCA (ARC-05)',
    guard: (context) =>
      payloadOf(context).hasImportedReceipt === true
        ? true
        : 'no hay un recibo oficial importado y validado para el período (ARC-05, ARC-06)',
  },
  {
    from: S.ARCA_DOCUMENT_IMPORTED,
    to: S.PENDING_PAYMENT,
    allowedRoles: [PlatformRole.FAMILY_EMPLOYER, PlatformRole.ACCOUNTANT, PlatformRole.SYSTEM],
    description: 'La comparación recibo/preliquidación no dejó diferencias bloqueantes (ARC-07)',
    guard: (context) =>
      payloadOf(context).hasOpenDifferences === true
        ? 'hay diferencias abiertas entre el recibo oficial y la preliquidación (ARC-07)'
        : true,
  },
  {
    from: S.PENDING_PAYMENT,
    to: S.PAID,
    allowedRoles: [PlatformRole.FAMILY_EMPLOYER],
    description: 'Se registra la transferencia directa a la trabajadora (PAG-01, PAG-10)',
    guard: (context) =>
      payloadOf(context).hasRegisteredPayment === true
        ? true
        : 'no hay un pago registrado con comprobante para el período (PAG-05)',
  },
  {
    from: S.PAID,
    to: S.RECONCILED,
    allowedRoles: [PlatformRole.FAMILY_EMPLOYER, PlatformRole.ACCOUNTANT, PlatformRole.SYSTEM],
    description: 'Se concilian sueldo, recibo oficial y obligaciones (PAG-06)',
    guard: (context) =>
      payloadOf(context).hasOpenDifferences === true
        ? 'el período no puede conciliarse con diferencias pendientes (PAG-06)'
        : true,
  },
  {
    from: S.RECONCILED,
    to: S.CLOSED,
    allowedRoles: [PlatformRole.FAMILY_EMPLOYER, PlatformRole.SYSTEM],
    description: 'Cierre definitivo del período (LIQ-12)',
  },

  // ── Rama de rectificación (RN-06, LIQ-13) ────────────────────────────────
  // Nunca reabre la versión cerrada: la marca para que se cree una versión nueva.
  // La anterior queda inalterada (INV-PAY-03).
  ...([S.ARCA_DOCUMENT_IMPORTED, S.PENDING_PAYMENT, S.PAID, S.RECONCILED, S.CLOSED] as const).map(
    (from): TransitionDefinition<PayrollPeriodStatus> => ({
      from,
      to: S.RECTIFICATION_REQUIRED,
      allowedRoles: [
        PlatformRole.FAMILY_EMPLOYER,
        PlatformRole.ACCOUNTANT,
        PlatformRole.ACCOUNTANT_MANAGER,
        PlatformRole.PLATFORM_ADMIN,
      ],
      description: 'Se detecta una diferencia que exige rectificativa (RN-06, LIQ-13)',
      guard: requireReason,
    }),
  ),
  {
    from: S.RECTIFICATION_REQUIRED,
    to: S.READY_FOR_CALCULATION,
    allowedRoles: [PlatformRole.FAMILY_EMPLOYER, PlatformRole.ACCOUNTANT, PlatformRole.SYSTEM],
    description: 'Se abre una nueva versión de liquidación; la anterior permanece intacta',
  },
];

export const payrollPeriodStateMachine = new StateMachine<PayrollPeriodStatus>(
  'PayrollPeriod',
  transitions,
  [S.CLOSED],
);
