import { Module } from '@nestjs/common';

/**
 * Módulo TimeTracking.
 *
 * Fichaje con QR, PIN, proximidad y carga manual autorizada. Offline con idempotencia.
 *
 * Requerimientos que cubre: FIC-01..FIC-05, FIC-08.
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
export class TimeTrackingModule {}
