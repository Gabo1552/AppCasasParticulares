'use client';

import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Cargando } from './ui';
import { esFamilia, esTrabajadora, useSession } from './session-provider';

/**
 * Envoltorio de las pantallas que exigen sesión y perfil.
 *
 * Redirige a quien no ingresó y ofrece completar el perfil a quien ingresó pero
 * todavía no eligió si opera como familia o como trabajadora.
 *
 * Es comodidad de navegación, **no** una barrera de seguridad: quien llame a la
 * API directamente se topa igual con el guard del servidor. Acá sólo se evita
 * mostrar una pantalla que no va a poder cargar nada.
 */
export function PantallaProtegida({
  rol,
  children,
}: {
  rol: 'FAMILY_EMPLOYER' | 'WORKER';
  children: ReactNode;
}): ReactNode {
  const { me, cargando } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!cargando && me === null) router.replace('/ingresar');
  }, [cargando, me, router]);

  if (cargando) return <Cargando que="tu sesión" />;
  if (me === null) return <Cargando que="tu sesión" />;

  const tieneRol = rol === 'FAMILY_EMPLOYER' ? esFamilia(me) : esTrabajadora(me);
  if (!tieneRol) {
    const comoQuien = rol === 'FAMILY_EMPLOYER' ? 'familia empleadora' : 'trabajadora';
    return (
      <div className="tarjeta">
        <h1>Falta completar tu perfil</h1>
        <p>
          Para entrar acá necesitás tener un perfil de {comoQuien}. Creálo y volvé a esta pantalla.
        </p>
        <Link
          className="boton"
          href={rol === 'FAMILY_EMPLOYER' ? '/onboarding/familia' : '/onboarding/trabajadora'}
        >
          Crear mi perfil de {comoQuien}
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
