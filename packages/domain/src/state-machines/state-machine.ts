import { IllegalStateTransitionError, TransitionGuardError } from '../errors';
import type { PlatformRole } from '../roles';

/**
 * Máquina de estados finita declarativa.
 *
 * El encargo es explícito: "Definí las transiciones válidas como máquinas de estado o
 * servicios de dominio explícitos. No permitas modificaciones arbitrarias de estados."
 *
 * De ahí sale la forma de esta clase: no existe un `setState(x)`. La única manera de
 * cambiar de estado es `transition(from, to, context)`, que verifica tres cosas —
 * que el arco exista, que el actor tenga el rol adecuado, y que la guarda se cumpla —
 * antes de devolver el estado nuevo.
 */

export interface TransitionContext {
  readonly actorRole: PlatformRole;
  /** Datos que la guarda necesita para decidir. Cada máquina define su forma. */
  readonly payload?: Readonly<Record<string, unknown>>;
}

export interface TransitionDefinition<TState extends string> {
  readonly from: TState;
  readonly to: TState;
  /** Roles que pueden ejecutar esta transición. Vacío = sólo el sistema. */
  readonly allowedRoles: readonly PlatformRole[];
  /** Precondición adicional. Devuelve `true` o el motivo del rechazo. */
  readonly guard?: (context: TransitionContext) => true | string;
  /** Qué representa la transición, para documentación y mensajes. */
  readonly description: string;
}

export class StateMachine<TState extends string> {
  private readonly index: Map<TState, TransitionDefinition<TState>[]>;

  constructor(
    readonly entityName: string,
    readonly transitions: readonly TransitionDefinition<TState>[],
    readonly terminalStates: readonly TState[] = [],
  ) {
    this.index = new Map();
    for (const transition of transitions) {
      const existing = this.index.get(transition.from) ?? [];
      existing.push(transition);
      this.index.set(transition.from, existing);
    }
  }

  /** Estados alcanzables desde `from`, sin evaluar roles ni guardas. */
  allowedTargets(from: TState): TState[] {
    return (this.index.get(from) ?? []).map((t) => t.to);
  }

  /** `true` si el arco existe, sin evaluar roles ni guardas. */
  hasTransition(from: TState, to: TState): boolean {
    return (this.index.get(from) ?? []).some((t) => t.to === to);
  }

  /**
   * Verifica si la transición es posible aquí y ahora, incluyendo rol y guarda.
   * Devuelve el motivo del rechazo en lugar de lanzar: sirve para que la UI decida
   * si mostrar un botón, sin usar excepciones como control de flujo.
   */
  canTransition(
    from: TState,
    to: TState,
    context: TransitionContext,
  ): { allowed: true } | { allowed: false; reason: string } {
    const candidates = (this.index.get(from) ?? []).filter((t) => t.to === to);

    if (candidates.length === 0) {
      return {
        allowed: false,
        reason: `${this.entityName}: no existe transición de ${from} a ${to}.`,
      };
    }

    const rejections: string[] = [];
    for (const candidate of candidates) {
      if (
        candidate.allowedRoles.length > 0 &&
        !candidate.allowedRoles.includes(context.actorRole)
      ) {
        rejections.push(
          `el rol ${context.actorRole} no puede ejecutar "${candidate.description}" ` +
            `(roles habilitados: ${candidate.allowedRoles.join(', ')})`,
        );
        continue;
      }

      const guardResult = candidate.guard?.(context) ?? true;
      if (guardResult !== true) {
        rejections.push(guardResult);
        continue;
      }

      return { allowed: true };
    }

    return { allowed: false, reason: rejections.join('; ') };
  }

  /**
   * Ejecuta la transición o lanza. Es el único camino admitido para cambiar de estado.
   */
  transition(from: TState, to: TState, context: TransitionContext): TState {
    if (!this.hasTransition(from, to)) {
      throw new IllegalStateTransitionError(this.entityName, from, to, this.allowedTargets(from));
    }

    const result = this.canTransition(from, to, context);
    if (!result.allowed) {
      throw new TransitionGuardError(result.reason, {
        entity: this.entityName,
        from,
        to,
        actorRole: context.actorRole,
      });
    }

    return to;
  }

  isTerminal(state: TState): boolean {
    return this.terminalStates.includes(state);
  }

  /** Representación textual del grafo, para documentación y diagnóstico. */
  describe(): string {
    return this.transitions
      .map(
        (t) => `${t.from} → ${t.to}  [${t.allowedRoles.join('|') || 'SISTEMA'}]  ${t.description}`,
      )
      .join('\n');
  }
}
