import { Module } from '@nestjs/common';

/**
 * Módulo PayrollVersions.
 *
 * Versiones y rectificativas. La versión anterior permanece inalterada.
 *
 * Requerimientos que cubre: LIQ-13, RN-06.
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
export class PayrollVersionsModule {}
