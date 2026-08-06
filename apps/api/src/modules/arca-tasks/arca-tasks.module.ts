import { Module } from '@nestjs/common';

/**
 * Módulo ArcaTasks.
 *
 * Tareas asistidas: checklist, valores a informar, enlaces oficiales y vencimientos.
 *
 * Requerimientos que cubre: ARC-01..ARC-04, ARC-09, ARC-10.
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
export class ArcaTasksModule {}
