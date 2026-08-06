'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api';
import type { Me } from '@/lib/types';

/**
 * Sesión del navegador.
 *
 * No guarda tokens: viven en cookies `HttpOnly` que el JavaScript no puede leer.
 * Lo que guarda es *quién* es la persona y qué roles tiene, que es lo que la
 * interfaz necesita para decidir qué mostrar.
 *
 * Ocultar una opción **no** es un control de acceso: la autorización real la hace
 * la API en cada request. Acá sólo se evita ofrecer botones que van a fallar.
 */

interface SessionState {
  me: Me | null;
  cargando: boolean;
  recargar: () => Promise<void>;
  cerrarSesion: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }): ReactNode {
  const [me, setMe] = useState<Me | null>(null);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async () => {
    try {
      setMe(await apiFetch<Me>('/auth/me'));
    } catch {
      // 401 es la respuesta normal para quien no ingresó: no es un error a mostrar.
      setMe(null);
    } finally {
      setCargando(false);
    }
  }, []);

  const cerrarSesion = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } finally {
      setMe(null);
      window.location.href = '/';
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return (
    <SessionContext.Provider value={{ me, cargando, recargar, cerrarSesion }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const context = useContext(SessionContext);
  if (context === null) {
    throw new Error('useSession necesita estar dentro de <SessionProvider>.');
  }
  return context;
}

export function esFamilia(me: Me | null): boolean {
  return me?.roles.includes('FAMILY_EMPLOYER') ?? false;
}

export function esTrabajadora(me: Me | null): boolean {
  return me?.roles.includes('WORKER') ?? false;
}
