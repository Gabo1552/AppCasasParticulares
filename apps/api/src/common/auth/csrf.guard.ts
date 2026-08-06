import { CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { CSRF_COOKIE, CSRF_HEADER } from './cookies';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protección CSRF por doble envío.
 *
 * Sólo aplica cuando la petición se autentica **con cookies**: si viene un
 * `Authorization: Bearer`, el navegador no adjunta nada automáticamente y el
 * ataque no existe. Esa distinción evita exigir el token a clientes que no usan
 * cookies, como la app móvil o las pruebas de integración.
 *
 * El chequeo es que la cookie legible `casas_csrf` y la cabecera `x-csrf-token`
 * coincidan. Un sitio de terceros puede hacer que el navegador envíe la cookie,
 * pero no puede leerla para construir la cabecera.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (SAFE_METHODS.has(request.method)) return true;

    const authorization = request.get('authorization');
    if (authorization !== undefined && authorization.startsWith('Bearer ')) return true;

    const cookies = request.cookies as Record<string, string> | undefined;
    const cookieToken = cookies?.[CSRF_COOKIE];
    // Sin cookie de sesión no hay nada que proteger: la ruta pública decidirá.
    if (cookieToken === undefined) return true;

    const headerToken = request.get(CSRF_HEADER);
    if (headerToken === undefined || headerToken !== cookieToken) {
      throw new ForbiddenException({
        code: 'CSRF_TOKEN_INVALID',
        message: 'La solicitud no incluye un token CSRF válido.',
      });
    }

    return true;
  }
}
