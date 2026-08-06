import { Module } from '@nestjs/common';

/**
 * Módulo Reconciliation.
 *
 * Conciliación de sueldo, recibo oficial y obligaciones. Bloquea con diferencias abiertas.
 *
 * Requerimientos que cubre: PAG-06, ARC-07.
 *
 * Estado: declarado en la Etapa 2 (base técnica). Los casos de uso se implementan
 * en la Etapa 3 (recorrido vertical), según docs/implementation-roadmap.md.
 * Anatomía esperada del módulo: docs/architecture.md §5.
 */
@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class ReconciliationModule {}
