import { Module } from '@nestjs/common';

/**
 * Módulo Audit.
 *
 * Eventos append-only y outbox. Escribe en la misma transacción que el negocio.
 *
 * Requerimientos que cubre: SEG-08, ADM-08.
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
export class AuditModule {}
