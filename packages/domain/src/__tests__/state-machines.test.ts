import { describe, expect, it } from 'vitest';
import { IllegalStateTransitionError, TransitionGuardError } from '../errors';
import { PlatformRole } from '../roles';
import {
  EmploymentRelationshipStatus as R,
  employmentRelationshipStateMachine as relationship,
} from '../state-machines/employment-relationship';
import {
  PayrollPeriodStatus as P,
  payrollPeriodStateMachine as period,
} from '../state-machines/payroll-period';
import {
  TimeEntryStatus as T,
  timeEntryStateMachine as timeEntry,
} from '../state-machines/time-entry';

describe('Máquina de estados de la relación laboral', () => {
  it('recorre el camino feliz de alta', () => {
    let state: (typeof R)[keyof typeof R] = R.DRAFT;

    state = relationship.transition(state, R.PENDING_WORKER_ACCEPTANCE, {
      actorRole: PlatformRole.FAMILY_EMPLOYER,
      payload: { hasHousehold: true },
    });
    expect(state).toBe(R.PENDING_WORKER_ACCEPTANCE);

    state = relationship.transition(state, R.PENDING_CONFIGURATION, {
      actorRole: PlatformRole.WORKER,
      payload: { hasWorkerAcceptance: true },
    });
    expect(state).toBe(R.PENDING_CONFIGURATION);

    state = relationship.transition(state, R.ACTIVE, {
      actorRole: PlatformRole.FAMILY_EMPLOYER,
      payload: { hasEffectiveTerms: true, hasPublishedSchedule: true },
    });
    expect(state).toBe(R.ACTIVE);
  });

  it('no permite invitar sin domicilio laboral (REL-02)', () => {
    expect(() =>
      relationship.transition(R.DRAFT, R.PENDING_WORKER_ACCEPTANCE, {
        actorRole: PlatformRole.FAMILY_EMPLOYER,
        payload: { hasHousehold: false },
      }),
    ).toThrow(TransitionGuardError);
  });

  it('no permite activar sin condiciones vigentes ni calendario (INV-REL-04)', () => {
    expect(() =>
      relationship.transition(R.PENDING_CONFIGURATION, R.ACTIVE, {
        actorRole: PlatformRole.FAMILY_EMPLOYER,
        payload: { hasEffectiveTerms: false, hasPublishedSchedule: true },
      }),
    ).toThrow(/condiciones vigentes/);

    expect(() =>
      relationship.transition(R.PENDING_CONFIGURATION, R.ACTIVE, {
        actorRole: PlatformRole.FAMILY_EMPLOYER,
        payload: { hasEffectiveTerms: true, hasPublishedSchedule: false },
      }),
    ).toThrow(/horario previsto/);
  });

  it('sólo la trabajadora puede aceptar la vinculación', () => {
    const result = relationship.canTransition(
      R.PENDING_WORKER_ACCEPTANCE,
      R.PENDING_CONFIGURATION,
      {
        actorRole: PlatformRole.FAMILY_EMPLOYER,
        payload: { hasWorkerAcceptance: true },
      },
    );
    expect(result.allowed).toBe(false);
  });

  it('rechaza saltos arbitrarios de estado', () => {
    expect(() =>
      relationship.transition(R.DRAFT, R.ACTIVE, { actorRole: PlatformRole.FAMILY_EMPLOYER }),
    ).toThrow(IllegalStateTransitionError);

    expect(() =>
      relationship.transition(R.DRAFT, R.TERMINATED, { actorRole: PlatformRole.PLATFORM_ADMIN }),
    ).toThrow(IllegalStateTransitionError);
  });

  it('exige motivo para suspender y motivo + fecha para dar de baja (REL-07)', () => {
    expect(() =>
      relationship.transition(R.ACTIVE, R.SUSPENDED, { actorRole: PlatformRole.FAMILY_EMPLOYER }),
    ).toThrow(/motivo/);

    expect(() =>
      relationship.transition(R.ACTIVE, R.TERMINATED, {
        actorRole: PlatformRole.FAMILY_EMPLOYER,
        payload: { reason: 'Fin del vínculo de común acuerdo' },
      }),
    ).toThrow(/fecha de finalización/);
  });

  it('no archiva con períodos abiertos ni sin legajo exportado', () => {
    expect(() =>
      relationship.transition(R.TERMINATED, R.ARCHIVED, {
        actorRole: PlatformRole.PLATFORM_ADMIN,
        payload: { hasOpenPayrollPeriods: true, hasDossierExport: true },
      }),
    ).toThrow(/períodos de liquidación abiertos/);

    expect(() =>
      relationship.transition(R.TERMINATED, R.ARCHIVED, {
        actorRole: PlatformRole.PLATFORM_ADMIN,
        payload: { hasOpenPayrollPeriods: false, hasDossierExport: false },
      }),
    ).toThrow(/legajo/);
  });

  it('ARCHIVED es terminal y no tiene salida', () => {
    expect(relationship.isTerminal(R.ARCHIVED)).toBe(true);
    expect(relationship.allowedTargets(R.ARCHIVED)).toEqual([]);
  });
});

describe('Máquina de estados del período de liquidación', () => {
  const employer = { actorRole: PlatformRole.FAMILY_EMPLOYER } as const;

  it('recorre el ciclo mensual completo hasta CLOSED', () => {
    let state: (typeof P)[keyof typeof P] = P.OPEN;

    state = period.transition(state, P.PENDING_ATTENDANCE_APPROVAL, employer);
    state = period.transition(state, P.READY_FOR_CALCULATION, {
      ...employer,
      payload: { allAttendanceApproved: true },
    });
    state = period.transition(state, P.CALCULATED, {
      ...employer,
      payload: { hasCalculation: true },
    });
    state = period.transition(state, P.APPROVED, {
      ...employer,
      payload: { hasBlockingErrors: false },
    });
    state = period.transition(state, P.PENDING_ARCA, employer);
    state = period.transition(state, P.ARCA_DOCUMENT_IMPORTED, {
      ...employer,
      payload: { hasImportedReceipt: true },
    });
    state = period.transition(state, P.PENDING_PAYMENT, {
      ...employer,
      payload: { hasOpenDifferences: false },
    });
    state = period.transition(state, P.PAID, {
      ...employer,
      payload: { hasRegisteredPayment: true },
    });
    state = period.transition(state, P.RECONCILED, {
      ...employer,
      payload: { hasOpenDifferences: false },
    });
    state = period.transition(state, P.CLOSED, employer);

    expect(state).toBe(P.CLOSED);
    expect(period.isTerminal(P.CLOSED)).toBe(true);
  });

  it('no aprueba con errores bloqueantes pendientes (LIQ-10, RN-07)', () => {
    expect(() =>
      period.transition(P.CALCULATED, P.APPROVED, {
        ...employer,
        payload: { hasBlockingErrors: true },
      }),
    ).toThrow(/errores bloqueantes/);
  });

  it('no avanza a cálculo con jornadas sin aprobar (FIC-07)', () => {
    expect(() =>
      period.transition(P.PENDING_ATTENDANCE_APPROVAL, P.READY_FOR_CALCULATION, {
        ...employer,
        payload: { allAttendanceApproved: false },
      }),
    ).toThrow(/jornadas sin aprobar/);
  });

  it('no concilia con diferencias abiertas (PAG-06, ARC-07)', () => {
    expect(() =>
      period.transition(P.PAID, P.RECONCILED, {
        ...employer,
        payload: { hasOpenDifferences: true },
      }),
    ).toThrow(/diferencias pendientes/);

    expect(() =>
      period.transition(P.ARCA_DOCUMENT_IMPORTED, P.PENDING_PAYMENT, {
        ...employer,
        payload: { hasOpenDifferences: true },
      }),
    ).toThrow(/diferencias abiertas/);
  });

  it('sólo el contador puede observar, y la observación es obligatoria (CON-06)', () => {
    expect(
      period.canTransition(P.PENDING_PROFESSIONAL_REVIEW, P.OBSERVED, {
        ...employer,
        payload: { observations: ['Falta el respaldo de la licencia'] },
      }).allowed,
    ).toBe(false);

    expect(() =>
      period.transition(P.PENDING_PROFESSIONAL_REVIEW, P.OBSERVED, {
        actorRole: PlatformRole.ACCOUNTANT,
        payload: { observations: [] },
      }),
    ).toThrow(/al menos una observación/);

    expect(
      period.transition(P.PENDING_PROFESSIONAL_REVIEW, P.OBSERVED, {
        actorRole: PlatformRole.ACCOUNTANT,
        payload: { observations: ['Falta el respaldo de la licencia'] },
      }),
    ).toBe(P.OBSERVED);
  });

  it('permite rectificar desde un período cerrado y exige motivo (RN-06, LIQ-13)', () => {
    expect(() =>
      period.transition(P.CLOSED, P.RECTIFICATION_REQUIRED, {
        actorRole: PlatformRole.ACCOUNTANT,
      }),
    ).toThrow(/motivo/);

    const state = period.transition(P.CLOSED, P.RECTIFICATION_REQUIRED, {
      actorRole: PlatformRole.ACCOUNTANT,
      payload: { reason: 'Diferencia detectada contra el recibo oficial' },
    });
    expect(state).toBe(P.RECTIFICATION_REQUIRED);

    // La rectificación abre una versión nueva; no reabre la cerrada.
    expect(period.allowedTargets(P.RECTIFICATION_REQUIRED)).toEqual([P.READY_FOR_CALCULATION]);
  });

  it('no permite volver de CLOSED a un estado anterior', () => {
    expect(() => period.transition(P.CLOSED, P.OPEN, employer)).toThrow(
      IllegalStateTransitionError,
    );
    expect(() => period.transition(P.CLOSED, P.APPROVED, employer)).toThrow(
      IllegalStateTransitionError,
    );
  });

  it('la trabajadora no puede mover el período', () => {
    for (const target of period.allowedTargets(P.OPEN)) {
      expect(period.canTransition(P.OPEN, target, { actorRole: PlatformRole.WORKER }).allowed).toBe(
        false,
      );
    }
  });
});

describe('Máquina de estados del fichaje', () => {
  it('sincroniza un fichaje offline y llega a aprobado', () => {
    let state: (typeof T)[keyof typeof T] = T.PENDING_SYNC;

    state = timeEntry.transition(state, T.RECORDED, { actorRole: PlatformRole.SYSTEM });
    state = timeEntry.transition(state, T.PENDING_APPROVAL, { actorRole: PlatformRole.SYSTEM });
    state = timeEntry.transition(state, T.APPROVED, {
      actorRole: PlatformRole.FAMILY_EMPLOYER,
      payload: { periodLocked: false },
    });

    expect(state).toBe(T.APPROVED);
  });

  it('la trabajadora puede objetar un fichaje ya aprobado (FIC-06)', () => {
    const state = timeEntry.transition(T.APPROVED, T.DISPUTED, {
      actorRole: PlatformRole.WORKER,
      payload: { reason: 'La salida quedó registrada una hora antes' },
    });
    expect(state).toBe(T.DISPUTED);
  });

  it('objetar exige motivo', () => {
    expect(() =>
      timeEntry.transition(T.RECORDED, T.DISPUTED, { actorRole: PlatformRole.WORKER }),
    ).toThrow(/motivo/);
  });

  it('no modifica asistencia de un período bloqueado (INV-TIME-05)', () => {
    expect(() =>
      timeEntry.transition(T.PENDING_APPROVAL, T.APPROVED, {
        actorRole: PlatformRole.FAMILY_EMPLOYER,
        payload: { periodLocked: true },
      }),
    ).toThrow(/reapertura auditada/);
  });

  it('corregir exige una solicitud de corrección aprobada (FIC-06)', () => {
    expect(() =>
      timeEntry.transition(T.DISPUTED, T.CORRECTED, {
        actorRole: PlatformRole.FAMILY_EMPLOYER,
        payload: { periodLocked: false, hasApprovedCorrection: false },
      }),
    ).toThrow(/corrección aprobada/);
  });

  it('CORRECTED y REJECTED son terminales: el original no se reescribe', () => {
    expect(timeEntry.isTerminal(T.CORRECTED)).toBe(true);
    expect(timeEntry.isTerminal(T.REJECTED)).toBe(true);
    expect(timeEntry.allowedTargets(T.CORRECTED)).toEqual([]);
    expect(timeEntry.allowedTargets(T.REJECTED)).toEqual([]);
  });

  it('la trabajadora no puede aprobar su propio fichaje', () => {
    expect(
      timeEntry.canTransition(T.PENDING_APPROVAL, T.APPROVED, {
        actorRole: PlatformRole.WORKER,
        payload: { periodLocked: false },
      }).allowed,
    ).toBe(false);
  });
});

describe('Invariantes generales de las máquinas', () => {
  it('todo estado declarado es alcanzable o inicial', () => {
    const machines = [
      { machine: relationship, states: Object.values(R), initial: [R.DRAFT] as string[] },
      { machine: period, states: Object.values(P), initial: [P.OPEN] as string[] },
      { machine: timeEntry, states: Object.values(T), initial: [T.PENDING_SYNC] as string[] },
    ];

    for (const { machine, states, initial } of machines) {
      const reachable = new Set<string>(machine.transitions.map((t) => t.to));
      for (const state of states) {
        expect(
          reachable.has(state) || initial.includes(state),
          `${machine.entityName}: el estado ${state} no es alcanzable ni inicial`,
        ).toBe(true);
      }
    }
  });

  it('ningún estado no terminal es un callejón sin salida', () => {
    for (const machine of [relationship, period, timeEntry]) {
      const origins = new Set(machine.transitions.map((t) => t.from));
      const destinations = new Set(machine.transitions.map((t) => t.to));
      for (const state of destinations) {
        if (machine.isTerminal(state)) continue;
        expect(
          origins.has(state),
          `${machine.entityName}: ${state} no es terminal pero no tiene salida`,
        ).toBe(true);
      }
    }
  });
});
