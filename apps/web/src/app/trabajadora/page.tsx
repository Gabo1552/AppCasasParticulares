'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { apiFetch, errorMessage } from '@/lib/api';
import { PantallaProtegida } from '@/components/pantalla-protegida';
import { Cargando, Error, Etiqueta, Vacio } from '@/components/ui';
import { tonoRelacion } from '@/components/resumen-relacion';
import { useSession } from '@/components/session-provider';
import { etiquetaRelacion } from '@/lib/format';
import type { Relationship } from '@/lib/types';

/**
 * Panel de la trabajadora.
 *
 * Muestra sólo las relaciones en las que participa: el filtro lo hace la API por
 * su identidad, no por rol. Tener el rol de trabajadora no da acceso a la
 * relación de otra persona.
 */
export default function PanelTrabajadora(): ReactNode {
  return (
    <PantallaProtegida rol="WORKER">
      <Contenido />
    </PantallaProtegida>
  );
}

function Contenido(): ReactNode {
  const { me } = useSession();
  const [relaciones, setRelaciones] = useState<Relationship[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function cargar(): Promise<void> {
      try {
        setRelaciones(await apiFetch<Relationship[]>('/employment-relationships'));
      } catch (causa) {
        setError(errorMessage(causa));
      }
    }
    void cargar();
  }, []);

  if (error !== null) return <Error mensaje={error} />;
  if (relaciones === null) return <Cargando que="tu trabajo" />;

  return (
    <div className="pila">
      <h1>Mi trabajo</h1>

      {me !== null && me.pendingInvitations > 0 && (
        <div className="tarjeta">
          <h2>Tenés una invitación sin responder</h2>
          <p>
            Abrí el enlace que te llegó por correo para ver quién te invitó y decidir si la aceptás.
          </p>
        </div>
      )}

      {relaciones.length === 0 ? (
        <Vacio>
          Todavía no tenés ninguna relación laboral registrada. Cuando una familia te invite, te va
          a llegar un correo con un enlace.
        </Vacio>
      ) : (
        relaciones.map((relacion) => (
          <article className="tarjeta" key={relacion.id}>
            <div className="entre">
              <div>
                <h2>{relacion.employer.name}</h2>
                <p className="suave">
                  {relacion.household.label} — {relacion.household.city}
                </p>
              </div>
              <Etiqueta
                texto={etiquetaRelacion(relacion.status)}
                tono={tonoRelacion(relacion.status)}
              />
            </div>

            <p>
              <strong>Siguiente paso:</strong> {relacion.nextAction.description}
            </p>

            <div className="tarjeta__pie">
              <Link className="boton" href={`/trabajadora/relaciones/${relacion.id}`}>
                {relacion.status === 'PENDING_WORKER_ACCEPTANCE'
                  ? 'Revisar las condiciones'
                  : 'Ver detalle'}
              </Link>
            </div>
          </article>
        ))
      )}
    </div>
  );
}
