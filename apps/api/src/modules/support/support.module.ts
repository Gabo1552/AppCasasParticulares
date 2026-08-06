import { Module } from '@nestjs/common';

/**
 * Módulo Support.
 *
 * Tickets con categoría, prioridad, escalamiento y protocolo para casos críticos.
 *
 * Requerimientos que cubre: SUP-01, SUP-02.
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
export class SupportModule {}
