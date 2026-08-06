import { Module } from '@nestjs/common';

/**
 * Módulo Identity.
 *
 * Registro, verificación por código de un solo uso, login, MFA, sesiones revocables y rotación de tokens.
 *
 * Requerimientos que cubre: SEG-01, SEG-02, SEG-05.
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
export class IdentityModule {}
