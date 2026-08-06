import { Module } from '@nestjs/common';

/**
 * Módulo Subscriptions.
 *
 * Planes y suscripciones. Separadas del salario y de los honorarios.
 *
 * Requerimientos que cubre: PAG-08, ADM-03, RN-09.
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
export class SubscriptionsModule {}
