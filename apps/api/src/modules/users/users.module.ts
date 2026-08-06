import { Module } from '@nestjs/common';

/**
 * Módulo Users.
 *
 * Usuarios, roles y preferencias. El alta o baja de un rol genera auditoría.
 *
 * Requerimientos que cubre: SEG-03, ADM-01.
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
export class UsersModule {}
