import { Module } from '@nestjs/common';

/**
 * Módulo Administration.
 *
 * Backoffice: usuarios, parámetros, planes, contenido legal y feature flags.
 *
 * Requerimientos que cubre: ADM-01..ADM-08.
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
export class AdministrationModule {}
