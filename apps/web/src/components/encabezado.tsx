'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { esFamilia, esTrabajadora, useSession } from './session-provider';

/**
 * Navegación según el rol.
 *
 * La familia y la trabajadora ven menús distintos porque hacen cosas distintas.
 * Alguien con los dos perfiles —una familia que además trabaja en otra casa— ve
 * ambos: el rol se acumula, no se elige.
 */
export function Encabezado(): ReactNode {
  const { me, cargando, cerrarSesion } = useSession();
  const pathname = usePathname();

  const enlaces: { href: string; texto: string }[] = [];
  if (esFamilia(me)) {
    enlaces.push(
      { href: '/familia', texto: 'Inicio' },
      { href: '/familia/domicilios', texto: 'Domicilios' },
      { href: '/familia/invitaciones', texto: 'Invitaciones' },
    );
  }
  if (esTrabajadora(me)) {
    enlaces.push({ href: '/trabajadora', texto: 'Mi trabajo' });
  }

  return (
    <header className="encabezado">
      <div className="encabezado__contenido">
        <Link className="encabezado__marca" href={inicioSegunRol(me !== null, esFamilia(me))}>
          Casas Particulares
        </Link>

        {enlaces.length > 0 && (
          <nav className="nav" aria-label="Secciones">
            {enlaces.map((enlace) => (
              <Link
                key={enlace.href}
                href={enlace.href}
                aria-current={pathname === enlace.href ? 'page' : undefined}
              >
                {enlace.texto}
              </Link>
            ))}
          </nav>
        )}

        {!cargando &&
          (me === null ? (
            <Link className="boton boton--secundario" href="/ingresar">
              Ingresar
            </Link>
          ) : (
            <span className="fila">
              <span className="suave">{me.email}</span>
              <button
                type="button"
                className="boton boton--secundario"
                onClick={() => {
                  void cerrarSesion();
                }}
              >
                Salir
              </button>
            </span>
          ))}
      </div>
    </header>
  );
}

function inicioSegunRol(autenticada: boolean, familia: boolean): string {
  if (!autenticada) return '/';
  return familia ? '/familia' : '/trabajadora';
}
