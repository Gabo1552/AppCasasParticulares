'use client';

import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { esFamilia, useSession } from '@/components/session-provider';
import { Cargando } from '@/components/ui';

/**
 * Inicio público.
 *
 * A quien ya ingresó lo lleva directamente a su panel: volver a leer la
 * presentación en cada visita no le sirve de nada.
 */
export default function Inicio(): ReactNode {
  const { me, cargando } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!cargando && me !== null) {
      router.replace(esFamilia(me) ? '/familia' : '/trabajadora');
    }
  }, [cargando, me, router]);

  if (cargando || me !== null) return <Cargando que="tu sesión" />;

  return (
    <div className="pila">
      <div className="tarjeta">
        <h1>Administrá el trabajo en casas particulares</h1>
        <p>
          Una herramienta para organizar la relación laboral con quien trabaja en tu casa: el
          domicilio, las condiciones acordadas y el horario semanal, en un solo lugar y con registro
          de lo que se acordó.
        </p>
        <div className="fila">
          <Link className="boton" href="/ingresar">
            Ingresar o crear mi cuenta
          </Link>
        </div>
        <p className="campo__ayuda">
          Se ingresa con un código que enviamos por correo. No hace falta recordar una contraseña.
        </p>
      </div>

      <div className="tarjeta">
        <h2>Cómo funciona</h2>
        <ol>
          <li>La familia crea su perfil y carga el domicilio donde se trabaja.</li>
          <li>Invita por correo a la persona que va a trabajar.</li>
          <li>La trabajadora ingresa, crea su perfil y acepta la invitación.</li>
          <li>La familia carga las condiciones acordadas y el horario semanal.</li>
          <li>La trabajadora revisa esas condiciones y las acepta.</li>
          <li>Recién ahí la relación queda activa para las dos partes.</li>
        </ol>
      </div>

      <div className="tarjeta">
        <h2>Qué hace y qué no hace esta plataforma</h2>
        <ul>
          <li>
            <strong>La familia es siempre la empleadora.</strong> La plataforma no emplea, no dirige
            ni sanciona a nadie.
          </li>
          <li>
            <strong>El sueldo no pasa por acá.</strong> El pago va directo de la familia a la
            persona trabajadora.
          </li>
          <li>
            <strong>No pedimos tu clave fiscal.</strong> Nunca. Los comprobantes oficiales se
            generan en los sistemas del organismo correspondiente.
          </li>
          <li>
            <strong>No es una bolsa de trabajo.</strong> Sirve para administrar una relación que ya
            existe o que las partes acordaron por su cuenta.
          </li>
        </ul>
      </div>
    </div>
  );
}
