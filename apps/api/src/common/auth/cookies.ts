import { randomBytes } from 'node:crypto';
import type { CookieOptions, Response } from 'express';
import type { AppConfig } from '../../config/app-config';
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from './access-token.service';

export const ACCESS_TOKEN_COOKIE = 'casas_access';
export const REFRESH_TOKEN_COOKIE = 'casas_refresh';
/** Legible por JavaScript a propósito: el cliente la copia a la cabecera. */
export const CSRF_COOKIE = 'casas_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/**
 * Cookies de sesión.
 *
 * `HttpOnly` para que un XSS no pueda leer los tokens. `Secure` en producción.
 * `SameSite=Lax`: la web y la API comparten sitio registrable (localhost en
 * desarrollo, mismo dominio en producción), así que `Lax` alcanza y no obliga a
 * `None`, que sería más laxo.
 *
 * `Lax` no cubre por completo el CSRF en peticiones de nivel superior, así que
 * además se emite la cookie `casas_csrf`, legible, que el cliente debe reflejar
 * en la cabecera `x-csrf-token`. Es el patrón de doble envío: un sitio de
 * terceros puede provocar que el navegador mande la cookie, pero no puede leerla
 * para construir la cabecera.
 */
function baseCookieOptions(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
}

export function setSessionCookies(
  response: Response,
  config: AppConfig,
  tokens: { accessToken: string; refreshToken: string },
): string {
  const base = baseCookieOptions(config);

  response.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...base,
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  response.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...base,
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  });

  const csrfToken = randomBytes(24).toString('base64url');
  response.cookie(CSRF_COOKIE, csrfToken, {
    ...base,
    httpOnly: false,
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  });

  return csrfToken;
}

/**
 * Reemplaza sólo el access token, dejando la sesión y su refresh intactos.
 *
 * Hace falta cuando los roles del usuario cambian dentro de una sesión abierta
 * —crear el perfil otorga `FAMILY_EMPLOYER` o `WORKER`—: el token vigente se
 * emitió antes y no los declara, así que sin esto la persona termina el alta y
 * la operación siguiente le responde 403 hasta que el token expire.
 */
export function refreshAccessCookie(
  response: Response,
  config: AppConfig,
  accessToken: string,
): void {
  response.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    ...baseCookieOptions(config),
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
}

export function clearSessionCookies(response: Response, config: AppConfig): void {
  const base = baseCookieOptions(config);
  response.clearCookie(ACCESS_TOKEN_COOKIE, base);
  response.clearCookie(REFRESH_TOKEN_COOKIE, base);
  response.clearCookie(CSRF_COOKIE, { ...base, httpOnly: false });
}
