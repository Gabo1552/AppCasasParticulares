import { Module } from '@nestjs/common';

/**
 * Módulo Documents.
 *
 * Object storage privado, URLs firmadas, antivirus, hash y retención.
 *
 * Requerimientos que cubre: DOC-01..DOC-05.
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
export class DocumentsModule {}
