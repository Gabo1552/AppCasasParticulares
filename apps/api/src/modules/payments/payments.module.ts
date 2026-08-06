import { Module } from '@nestjs/common';

/**
 * Módulo Payments.
 *
 * Registro de la transferencia directa familia → trabajadora, con comprobante.
 *
 * Requerimientos que cubre: PAG-01, PAG-02, PAG-05, PAG-07, PAG-10.
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
export class PaymentsModule {}
