import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { PlatformRole } from '@casas/database';
import type { Request } from 'express';

/** Actor autenticado, tal como lo resuelve el guard desde el access token. */
export interface AuthenticatedActor {
  readonly userId: string;
  readonly roles: readonly PlatformRole[];
  readonly sessionId: string;
  /** Perfil de familia, si el usuario lo completó. */
  readonly employerId: string | null;
  /** Perfil de trabajadora, si lo completó. */
  readonly workerId: string | null;
  readonly ipAddress?: string | undefined;
  readonly userAgent?: string | undefined;
}

export interface RequestWithActor extends Request {
  actor?: AuthenticatedActor;
}

/** Marca una ruta como pública: no exige sesión. */
export const IS_PUBLIC_KEY = 'casas:isPublic';
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Roles admitidos para la ruta (capa 1, RBAC).
 *
 * Nunca alcanza por sí solo: el permiso sobre el objeto concreto lo resuelve la
 * policy del módulo (SEG-03, docs/security-model.md §3).
 */
export const ROLES_KEY = 'casas:roles';
export const Roles = (...roles: PlatformRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

/** Inyecta el actor autenticado en el handler. */
export const Actor = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<RequestWithActor>();
  return request.actor;
});
