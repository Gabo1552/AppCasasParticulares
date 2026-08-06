import { Module } from '@nestjs/common';

/**
 * Módulo PayrollPeriods.
 *
 * Ciclo del período mensual y sus transiciones de estado.
 *
 * Requerimientos que cubre: LIQ-01, LIQ-12.
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
export class PayrollPeriodsModule {}
