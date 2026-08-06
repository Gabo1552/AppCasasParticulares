'use client';

import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { esFamilia, esTrabajadora, useSession } from '@/components/session-provider';
import { Cargando } from '@/components/ui';

/**
 * Elección del perfil.
 *
 * Ingresar no otorga ningún rol: crear el perfil es lo que lo otorga. Quien ya
 * tiene uno no ve esta pantalla, va derecho a su panel.
 */
export default function ElegirPerfil(): ReactNode {
  const { me, cargando } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (cargando) return;
    if (me === null) {
      router.replace('/ingresar');
      return;
    }
    if (esFamilia(me)) router.replace('/familia');
    else if (esTrabajadora(me)) router.replace('/trabajadora');
  }, [cargando, me, router]);

  if (cargando || me === null || esFamilia(me) || esTrabajadora(me)) {
    return <Cargando que="tu perfil" />;
  }

  return (
    <div className="pila">
      <div className="tarjeta">
        <h1>¿Cómo vas a usar la plataforma?</h1>
        <p className="suave">
          Elegí según tu situación. Si más adelante te toca la otra —por ejemplo, sos familia
          empleadora y además trabajás en otra casa— vas a poder crear también el otro perfil.
        </p>
      </div>

      {me.pendingInvitations > 0 && (
        <div className="tarjeta">
          <h2>Tenés una invitación esperando</h2>
          <p>
            Alguien te invitó a registrar tu trabajo. Creá tu perfil de trabajadora para poder verla
            y decidir.
          </p>
          <Link className="boton" href="/onboarding/trabajadora">
            Crear mi perfil de trabajadora
          </Link>
        </div>
      )}

      <div className="tarjeta">
        <h2>Soy la familia empleadora</h2>
        <p>
          Contratás a alguien para trabajar en tu casa. Vas a cargar el domicilio, invitar a la
          persona y acordar las condiciones y el horario.
        </p>
        <Link className="boton" href="/onboarding/familia">
          Crear mi perfil de familia
        </Link>
      </div>

      <div className="tarjeta">
        <h2>Trabajo en casas particulares</h2>
        <p>
          Trabajás en la casa de otra persona. Vas a poder ver quién te invitó, revisar las
          condiciones que te proponen y aceptarlas o rechazarlas.
        </p>
        <Link className="boton boton--secundario" href="/onboarding/trabajadora">
          Crear mi perfil de trabajadora
        </Link>
      </div>
    </div>
  );
}
