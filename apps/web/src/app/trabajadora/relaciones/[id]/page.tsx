'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/api';
import { PantallaProtegida } from '@/components/pantalla-protegida';
import { Campo, Cargando, Error, Exito } from '@/components/ui';
import { ResumenRelacion } from '@/components/resumen-relacion';
import type { Relationship } from '@/lib/types';

/**
 * Revisión de las condiciones, del lado de la trabajadora.
 *
 * Es la única pantalla desde la que una relación puede quedar activa. Aceptar es
 * un acto de la trabajadora y de nadie más: la familia no tiene este botón, ni
 * en su pantalla ni en la API.
 */
export default function RevisarCondiciones(): ReactNode {
  return (
    <PantallaProtegida rol="WORKER">
      <Contenido />
    </PantallaProtegida>
  );
}

function Contenido(): ReactNode {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [relacion, setRelacion] = useState<Relationship | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [rechazando, setRechazando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setRelacion(await apiFetch<Relationship>(`/employment-relationships/${id}`));
    } catch (causa) {
      setError(errorMessage(causa));
    }
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function aceptar(): Promise<void> {
    setErrorAccion(null);
    setEnviando(true);
    try {
      await apiFetch(`/employment-relationships/${id}/accept`, { method: 'POST', body: {} });
      setAviso('Aceptaste las condiciones. La relación laboral quedó activa.');
      await cargar();
    } catch (causa) {
      setErrorAccion(errorMessage(causa));
    } finally {
      setEnviando(false);
    }
  }

  async function rechazar(): Promise<void> {
    setErrorAccion(null);
    setEnviando(true);
    try {
      await apiFetch(`/employment-relationships/${id}/reject`, {
        method: 'POST',
        body: { reason: motivo.trim() },
      });
      setAviso('Le avisamos a la familia. Va a poder corregir las condiciones y reenviártelas.');
      setRechazando(false);
      setMotivo('');
      await cargar();
    } catch (causa) {
      setErrorAccion(errorMessage(causa));
    } finally {
      setEnviando(false);
    }
  }

  if (error !== null && relacion === null) {
    return (
      <div className="tarjeta">
        <Error mensaje={error} />
        <Link className="boton boton--secundario" href="/trabajadora">
          Volver a mi trabajo
        </Link>
      </div>
    );
  }

  if (relacion === null) return <Cargando que="las condiciones" />;

  const puedeDecidir = relacion.status === 'PENDING_WORKER_ACCEPTANCE';

  return (
    <div className="pila">
      <div className="entre">
        <h1>Condiciones de trabajo</h1>
        <Link className="boton boton--secundario" href="/trabajadora">
          Volver
        </Link>
      </div>

      <Exito mensaje={aviso} />

      {relacion.status === 'PENDING_CONFIGURATION' && (
        <div className="tarjeta">
          <h2>La familia todavía está cargando las condiciones</h2>
          <p>Cuando termine, te van a aparecer acá para que las revises. Te avisamos por correo.</p>
        </div>
      )}

      <ResumenRelacion relacion={relacion} />

      {puedeDecidir && (
        <section className="tarjeta">
          <h2>¿Estás de acuerdo con estas condiciones?</h2>
          <p className="suave">
            Si aceptás, la relación laboral queda activa con lo que figura arriba. Si algo no
            coincide con lo que hablaron, rechazalas y contá qué habría que corregir: la familia va
            a poder cambiarlas y volver a enviártelas.
          </p>

          <Error mensaje={errorAccion} />

          {!rechazando ? (
            <div className="fila">
              <button
                type="button"
                className="boton"
                disabled={enviando}
                onClick={() => void aceptar()}
              >
                {enviando ? 'Procesando…' : 'Acepto estas condiciones'}
              </button>
              <button
                type="button"
                className="boton boton--peligro"
                disabled={enviando}
                onClick={() => {
                  setRechazando(true);
                }}
              >
                No estoy de acuerdo
              </button>
            </div>
          ) : (
            <>
              <Campo
                etiqueta="¿Qué habría que corregir?"
                ayuda="Lo va a leer la familia. Contá brevemente qué no coincide."
              >
                {(id2) => (
                  <textarea
                    id={id2}
                    name="reason"
                    rows={3}
                    maxLength={300}
                    value={motivo}
                    onChange={(event) => {
                      setMotivo(event.target.value);
                    }}
                  />
                )}
              </Campo>
              <div className="fila">
                <button
                  type="button"
                  className="boton boton--peligro"
                  disabled={enviando || motivo.trim().length < 3}
                  onClick={() => void rechazar()}
                >
                  {enviando ? 'Enviando…' : 'Enviar mi respuesta'}
                </button>
                <button
                  type="button"
                  className="boton boton--secundario"
                  disabled={enviando}
                  onClick={() => {
                    setRechazando(false);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
