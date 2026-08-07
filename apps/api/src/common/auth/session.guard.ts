import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PlatformRole } from '@casas/database';
import { AccessTokenService } from './access-token.service';
import { ACCESS_TOKEN_COOKIE } from './cookies';
import { IS_PUBLIC_KEY, ROLES_KEY, type RequestWithActor } from './auth.types';

import { RedisSessionRevocationService } from '../../modules/identity/redis-session-revocation.service';

/**
 * Guard de sesión y RBAC.
 *
 * Resuelve el actor desde el access token (cookie HttpOnly, o cabecera Bearer
 * para clientes que no usan cookies) y verifica el rol declarado en la ruta.
 *
 * **El rol nunca alcanza por sí solo.** Este guard responde "¿este tipo de
 * usuario puede intentar la acción?"; que pueda tocar *ese* recurso lo decide la
 * policy del módulo (SEG-03).
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessTokens: AccessTokenService,
    private readonly sessionRevocation: RedisSessionRevocationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const request = context.switchToHttp().getRequest<RequestWithActor>();
    const token = extractToken(request);

    if (token === null) {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'Necesitás iniciar sesión.',
      });
    }

    const payload = this.accessTokens.verify(token);
    if (payload === null) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_TOKEN',
        message: 'Tu sesión venció. Volvé a ingresar.',
      });
    }

    const isRevoked = await this.sessionRevocation.isSessionRevoked(payload.sid);
    if (isRevoked) {
      throw new UnauthorizedException({
        code: 'AUTH_SESSION_REVOKED',
        message: 'Tu sesión fue revocada. Volvé a ingresar.',
      });
    }

    request.actor = {
      userId: payload.sub,
      sessionId: payload.sid,
      roles: payload.roles,
      employerId: payload.emp,
      workerId: payload.wrk,
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    };

    const requiredRoles = this.reflector.getAllAndOverride<PlatformRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredRoles === undefined || requiredRoles.length === 0) return true;

    if (!requiredRoles.some((role) => payload.roles.includes(role))) {
      throw new ForbiddenException({
        code: 'AUTH_ROLE_REQUIRED',
        message: 'No tenés permiso para esta operación.',
      });
    }

    return true;
  }
}

function extractToken(request: RequestWithActor): string | null {
  const cookies = request.cookies as Record<string, string> | undefined;
  const fromCookie = cookies?.[ACCESS_TOKEN_COOKIE];
  if (typeof fromCookie === 'string' && fromCookie.length > 0) return fromCookie;

  const header = request.get('authorization');
  if (header !== undefined && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length);
  }
  return null;
}
