import { ARCAIntegrationNotEnabledError, type ARCAConnector } from '@casas/domain';

/**
 * Conector oficial con ARCA — **deshabilitado**.
 *
 * Existe, está registrado y falla de manera controlada. Las cinco operaciones
 * lanzan `ARCAIntegrationNotEnabledError`, que la capa HTTP mapea a 501 con un
 * mensaje explícito.
 *
 * **No devuelve datos simulados.** El encargo es claro: "Toda funcionalidad futura
 * debe quedar separada detrás de interfaces o feature flags, no simulada como si
 * ya estuviera integrada." Un flag apagado tiene que ser distinguible de un flag
 * encendido; devolver un dato inventado sería peor que devolver un error.
 *
 * Condiciones para habilitarlo (las siete deben cumplirse):
 * docs/arca-integration-strategy.md §6.
 *
 * Cuando llegue el momento, esta clase implementará WSAA + el web service que ARCA
 * autorice, con certificados en el gestor de secretos, ambientes de homologación y
 * producción segregados (ARC-12), idempotencia, reintentos controlados y trazas.
 * Nada de eso existe todavía, y por eso no hay código que lo aparente.
 */
export class OfficialARCAConnector implements ARCAConnector {
  readonly kind = 'OFFICIAL' as const;

  private notEnabled(operation: string): never {
    throw new ARCAIntegrationNotEnabledError(operation);
  }

  getRelationshipStatus(): Promise<never> {
    return this.notEnabled('getRelationshipStatus');
  }

  getObligations(): Promise<never> {
    return this.notEnabled('getObligations');
  }

  createReceipt(): Promise<never> {
    return this.notEnabled('createReceipt');
  }

  downloadReceipt(): Promise<never> {
    return this.notEnabled('downloadReceipt');
  }

  validateReceipt(): Promise<never> {
    return this.notEnabled('validateReceipt');
  }
}
