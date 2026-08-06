'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { apiFetch, errorMessage } from '@/lib/api';
import { PantallaProtegida } from '@/components/pantalla-protegida';
import { BotonConfirmacion, Cargando, Error, Exito, Vacio } from '@/components/ui';
import type { Household } from '@/lib/types';

/**
 * Domicilios de la familia.
 *
 * Sólo se ven los propios: la API filtra por dueño y responde 404 —no 403— ante
 * un domicilio ajeno, así que ni siquiera se puede confirmar que ese id exista.
 */
export default function Domicilios(): ReactNode {
  return (
    <PantallaProtegida rol="FAMILY_EMPLOYER">
      <Contenido />
    </PantallaProtegida>
  );
}

function Contenido(): ReactNode {
  const [domicilios, setDomicilios] = useState<Household[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setDomicilios(await apiFetch<Household[]>('/households'));
    } catch (causa) {
      setError(errorMessage(causa));
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function archivar(id: string): Promise<void> {
    setError(null);
    setAviso(null);
    try {
      await apiFetch(`/households/${id}`, { method: 'DELETE' });
      setAviso('El domicilio quedó archivado. No se borró: su historial se conserva.');
      await cargar();
    } catch (causa) {
      setError(errorMessage(causa));
    }
  }

  if (domicilios === null && error === null) return <Cargando que="tus domicilios" />;

  return (
    <div className="pila">
      <div className="entre">
        <h1>Domicilios</h1>
        <Link className="boton" href="/familia/domicilios/nuevo">
          Agregar domicilio
        </Link>
      </div>

      <Error mensaje={error} />
      <Exito mensaje={aviso} />

      {domicilios !== null && domicilios.length === 0 ? (
        <Vacio>Todavía no cargaste ningún domicilio.</Vacio>
      ) : (
        (domicilios ?? []).map((domicilio) => (
          <article className="tarjeta" key={domicilio.id}>
            <div className="entre">
              <h2>{domicilio.label}</h2>
              {!domicilio.isActive && <span className="etiqueta etiqueta--cerrada">Archivado</span>}
            </div>

            <dl className="datos">
              <div>
                <dt>Dirección</dt>
                <dd>
                  {domicilio.street} {domicilio.streetNumber}
                  {domicilio.floor !== null && `, piso ${domicilio.floor}`}
                  {domicilio.apartment !== null && `, depto ${domicilio.apartment}`}
                </dd>
              </div>
              <div>
                <dt>Localidad</dt>
                <dd>
                  {domicilio.city}, {domicilio.province} ({domicilio.postalCode})
                </dd>
              </div>
              {domicilio.accessInstructions !== null && (
                <div>
                  <dt>Cómo entrar</dt>
                  <dd>{domicilio.accessInstructions}</dd>
                </div>
              )}
            </dl>

            {domicilio.isActive && (
              <div className="tarjeta__pie">
                <Link
                  className="boton boton--secundario"
                  href={`/familia/domicilios/${domicilio.id}`}
                >
                  Editar
                </Link>
                <BotonConfirmacion
                  pregunta="¿Archivar este domicilio?"
                  onConfirmar={() => archivar(domicilio.id)}
                >
                  Archivar
                </BotonConfirmacion>
              </div>
            )}
          </article>
        ))
      )}
    </div>
  );
}
