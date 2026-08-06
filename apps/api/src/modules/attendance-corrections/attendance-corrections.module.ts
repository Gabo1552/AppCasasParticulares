import { Module } from '@nestjs/common';

/**
 * Módulo AttendanceCorrections.
 *
 * Solicitud y aprobación de correcciones. El fichaje original nunca se borra.
 *
 * Requerimientos que cubre: FIC-06, FIC-07.
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
export class AttendanceCorrectionsModule {}
