/**
 * Errores del dominio.
 *
 * Todos llevan un `code` estable: la capa HTTP lo mapea a un status y los clientes
 * pueden reaccionar sin parsear mensajes. Los mensajes son en español porque los ve
 * un usuario final argentino; los códigos son en inglés porque los consume el código.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(
    message: string,
    readonly context: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Un valor de entrada no cumple una invariante del dominio. */
export class InvalidValueError extends DomainError {
  readonly code = 'DOMAIN_INVALID_VALUE';
}

/** Se intentó una transición de estado que la máquina no permite. */
export class IllegalStateTransitionError extends DomainError {
  readonly code = 'DOMAIN_ILLEGAL_STATE_TRANSITION';

  constructor(entity: string, from: string, to: string, allowed: readonly string[]) {
    super(
      `Transición inválida en ${entity}: ${from} → ${to}. ` +
        `Transiciones permitidas desde ${from}: ${allowed.length > 0 ? allowed.join(', ') : '(ninguna)'}.`,
      { entity, from, to, allowed },
    );
  }
}

/** Una guarda de la transición no se cumplió (el estado destino es alcanzable, pero no ahora). */
export class TransitionGuardError extends DomainError {
  readonly code = 'DOMAIN_TRANSITION_GUARD_FAILED';
}

/**
 * La integración oficial con ARCA no está habilitada.
 *
 * Lo lanza `OfficialARCAConnector`. Nunca se devuelven datos simulados: un flag
 * apagado tiene que ser distinguible de un flag encendido
 * (docs/arca-integration-strategy.md §5).
 */
export class ARCAIntegrationNotEnabledError extends DomainError {
  readonly code = 'ARCA_INTEGRATION_NOT_ENABLED';

  constructor(operation: string) {
    super(
      `La integración oficial con ARCA no está habilitada. Operación solicitada: ${operation}. ` +
        'El flujo vigente es el asistido (ManualAssistedARCAConnector).',
      { operation },
    );
  }
}

/** Un actor intentó operar sobre un recurso al que no está vinculado (SEG-03). */
export class ObjectPermissionDeniedError extends DomainError {
  readonly code = 'DOMAIN_OBJECT_PERMISSION_DENIED';
}
