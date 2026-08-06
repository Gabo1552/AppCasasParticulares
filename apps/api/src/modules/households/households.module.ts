import { Module } from '@nestjs/common';

/**
 * Módulo Households.
 *
 * Domicilios laborales. La dirección exacta sólo es visible a autorizados.
 *
 * Requerimientos que cubre: PER-02, REL-02.
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
export class HouseholdsModule {}
