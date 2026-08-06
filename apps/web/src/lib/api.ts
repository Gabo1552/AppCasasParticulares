/**
 * Cliente de la API.
 *
 * La sesión viaja en cookies `HttpOnly`, así que el navegador las manda solo con
 * `credentials: 'include'` y el JavaScript de la página nunca ve los tokens. Lo
 * que sí lee es la cookie `casas_csrf`, que copia a la cabecera `x-csrf-token`:
 * un sitio de terceros puede lograr que el navegador envíe la cookie, pero no
 * puede leerla para armar la cabecera.
 */

const API_BASE_URL = process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://localhost:3001';

export const CSRF_COOKIE = 'casas_csrf';

/** Error con el código de la API, para que la pantalla decida qué mostrar. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${name}=`));
  return match === undefined ? null : decodeURIComponent(match.slice(name.length + 1));
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const csrf = readCookie(CSRF_COOKIE);
  if (csrf !== null && method !== 'GET') headers['x-csrf-token'] = csrf;

  const response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    method,
    headers,
    credentials: 'include',
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  if (response.status === 204) return undefined as T;

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload ?? {}) as { code?: string; message?: string; details?: unknown };
    throw new ApiError(
      error.code ?? 'UNKNOWN',
      error.message ?? 'No pudimos completar la operación. Probá de nuevo.',
      response.status,
      error.details,
    );
  }

  return payload as T;
}

/**
 * Mensaje para mostrar en pantalla.
 *
 * La API ya responde en español y en un registro comprensible, así que se usa su
 * texto. Lo que se agrega es el caso en que ni siquiera hubo respuesta: ahí el
 * mensaje del navegador ("Failed to fetch") no le dice nada a nadie.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof TypeError) {
    return 'No pudimos conectarnos con el servidor. Revisá tu conexión e intentá de nuevo.';
  }
  return 'Ocurrió un error inesperado. Probá de nuevo en unos minutos.';
}
