'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { apiFetch, errorMessage } from '@/lib/api';
import { PantallaProtegida } from '@/components/pantalla-protegida';
import { Cargando, Error, Etiqueta, Vacio } from '@/components/ui';
import { etiquetaRelacion } from '@/lib/format';
import type { Household, Relationship, RelationshipStatus } from '@/lib/types';

/**
 * Panel de la familia.
 *
 * Muestra qué falta hacer y quién lo tiene que hacer. La API ya calcula ese
 * `nextAction` por relación: la pantalla no vuelve a deducirlo, porque dos
 * lugares distintos decidiendo lo mismo terminan discrepando.
 */
export default function PanelFamilia(): ReactNode {
  return (
    <PantallaProtegida rol="FAMILY_EMPLOYER">
      <Contenido />
    </PantallaProtegida>
  );
}

function Contenido(): ReactNode {
  const [domicilios, setDomicilios] = useState<Household[] | null>(null);
  const [relaciones, setRelaciones] = useState<Relationship[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [d, r] = await Promise.all([
        apiFetch<Household[]>('/households'),
        apiFetch<Relationship[]>('/employment-relationships'),
      ]);
      setDomicilios(d);
      setRelaciones(r);
    } catch (causa) {
      setError(errorMessage(causa));
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (error !== null) return <Error mensaje={error} />;
  if (domicilios === null || relaciones === null) return <Cargando que="tu panel" />;

  return (
    <div className="pila">
      <div className="entre">
        <h1>Tu panel</h1>
      </div>

      {domicilios.length === 0 && (
        <div className="tarjeta">
          <h2>Empecemos por el domicilio</h2>
          <p>
            Cargá la dirección donde se trabaja. Después vas a poder invitar a la persona que va a
            trabajar ahí.
          </p>
          <Link className="boton" href="/familia/domicilios/nuevo">
            Agregar un domicilio
          </Link>
        </div>
      )}

      {domicilios.length > 0 && relaciones.length === 0 && (
        <div className="tarjeta">
          <h2>Invitá a quien va a trabajar</h2>
          <p>
            Ya tenés {domicilios.length === 1 ? 'un domicilio cargado' : 'domicilios cargados'}.
            Enviá una invitación por correo para que la persona pueda registrarse y ver las
            condiciones.
          </p>
          <Link className="boton" href="/familia/invitaciones/nueva">
            Invitar a una trabajadora
          </Link>
        </div>
      )}

      <section>
        <div className="entre">
          <h2>Relaciones laborales</h2>
          <Link className="boton boton--secundario" href="/familia/invitaciones/nueva">
            Invitar
          </Link>
        </div>

        {relaciones.length === 0 ? (
          <Vacio>Todavía no hay ninguna relación laboral.</Vacio>
        ) : (
          relaciones.map((relacion) => (
            <article className="tarjeta" key={relacion.id}>
              <div className="entre">
                <div>
                  <h3>{relacion.worker?.name ?? 'Trabajadora sin confirmar'}</h3>
                  <p className="suave">
                    {relacion.household.label} · {relacion.household.city}
                  </p>
                </div>
                <Etiqueta texto={etiquetaRelacion(relacion.status)} tono={tono(relacion.status)} />
              </div>

              <p>
                <strong>Siguiente paso:</strong> {relacion.nextAction.description}
              </p>

              <div className="tarjeta__pie">
                <Link className="boton" href={`/familia/relaciones/${relacion.id}`}>
                  {relacion.nextAction.actor === 'FAMILY_EMPLOYER' ? 'Continuar' : 'Ver detalle'}
                </Link>
              </div>
            </article>
          ))
        )}
      </section>

      <section>
        <div className="entre">
          <h2>Domicilios</h2>
          <Link className="boton boton--secundario" href="/familia/domicilios">
            Administrar
          </Link>
        </div>
        {domicilios.length === 0 ? (
          <Vacio>Todavía no cargaste ningún domicilio.</Vacio>
        ) : (
          <div className="tarjeta">
            <ul>
              {domicilios.map((domicilio) => (
                <li key={domicilio.id}>
                  {domicilio.label} — {domicilio.street} {domicilio.streetNumber}, {domicilio.city}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

export function tono(status: RelationshipStatus): 'activa' | 'espera' | 'cerrada' {
  if (status === 'ACTIVE') return 'activa';
  if (status === 'TERMINATED' || status === 'SUSPENDED') return 'cerrada';
  return 'espera';
}
