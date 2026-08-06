/**
 * Adaptador pendiente de implementación.
 *
 * Algunos puertos (`ARCAConnector`, `PaymentProvider`) tienen su adaptador escrito
 * y probado, pero necesitan repositorios que llegan en la Etapa 3. Hasta entonces
 * hace falta registrar *algo* en el contenedor de dependencias.
 *
 * Las tres opciones eran:
 *  1. no registrar el token → cualquier módulo que lo inyecte falla con un error
 *     de Nest incomprensible;
 *  2. registrar una factory que lance → **la aplicación entera no arranca**, ni
 *     siquiera `/health`, porque Nest instancia los proveedores al iniciar;
 *  3. registrar un objeto que falle al **usarse**.
 *
 * La 3 es la correcta: la API levanta, los health checks responden, y el primer
 * intento de usar el puerto falla con un mensaje que dice exactamente qué falta.
 * Sigue cumpliendo la regla del encargo — nada se simula, no se devuelven datos
 * inventados —, sólo mueve el momento del fallo del arranque al uso.
 */

export class AdapterNotImplementedError extends Error {
  readonly code = 'ADAPTER_NOT_IMPLEMENTED';

  constructor(
    readonly adapterName: string,
    readonly operation: string,
    reason: string,
  ) {
    super(`${adapterName}.${operation}() todavía no está disponible: ${reason}`);
    this.name = 'AdapterNotImplementedError';
  }
}

export interface PendingAdapterOptions<T> {
  /** Nombre del adaptador real, para que el error diga cuál falta. */
  readonly adapterName: string;
  /** Qué falta para implementarlo. Aparece en el mensaje de error. */
  readonly reason: string;
  /**
   * Operaciones del puerto que deben lanzar.
   *
   * Se declaran explícitamente en lugar de interceptar todo acceso: Nest consulta
   * `onModuleInit`, `onApplicationBootstrap` y otros hooks de ciclo de vida sobre
   * cada proveedor, y un proxy que devuelva una función para cualquier nombre haría
   * que Nest los invoque y el arranque falle igual que antes.
   */
  readonly operations: readonly (keyof T & string)[];
  /** Propiedades que sí tienen un valor conocido, como `kind`. */
  readonly properties?: Partial<T>;
}

/**
 * Crea un objeto que satisface la forma de un puerto: expone las propiedades
 * declaradas y lanza en cada operación declarada. Todo lo demás es `undefined`,
 * de modo que Nest lo trate como un proveedor sin hooks de ciclo de vida.
 */
export function createPendingAdapter<T extends object>(options: PendingAdapterOptions<T>): T {
  const { adapterName, reason, operations, properties = {} } = options;
  const target = { ...properties } as Record<string, unknown>;

  for (const operation of operations) {
    target[operation] = (): never => {
      throw new AdapterNotImplementedError(adapterName, operation, reason);
    };
  }

  return target as T;
}
