'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/api';
import { PantallaProtegida } from '@/components/pantalla-protegida';
import { Cargando, Error, Exito } from '@/components/ui';
import {
  FormularioCondiciones,
  condicionesACuerpo,
  condicionesIniciales,
  type DatosCondiciones,
} from '@/components/formulario-condiciones';
import {
  FormularioHorario,
  horarioACuerpo,
  horarioInicial,
  type DatosHorario,
} from '@/components/formulario-horario';
import { ResumenRelacion } from '@/components/resumen-relacion';
import type { Relationship } from '@/lib/types';

/**
 * Configuración de la relación laboral, del lado de la familia.
 *
 * Tres secciones en orden: condiciones, horario y envío. Se puede volver sobre
 * cualquiera mientras la trabajadora no haya aceptado; si ya se enviaron y la
 * familia cambia algo, la relación vuelve a "falta configurar" y hay que enviar
 * de nuevo. Es a propósito: la trabajadora acepta lo que ve, no lo que vio antes.
 *
 * **La familia no puede activar la relación.** El único camino a "activa" es que
 * la trabajadora acepte, y ese botón no existe en esta pantalla.
 */
export default function ConfigurarRelacion(): ReactNode {
  return (
    <PantallaProtegida rol="FAMILY_EMPLOYER">
      <Contenido />
    </PantallaProtegida>
  );
}

function Contenido(): ReactNode {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [relacion, setRelacion] = useState<Relationship | null>(null);
  const [condiciones, setCondiciones] = useState<DatosCondiciones | null>(null);
  const [horario, setHorario] = useState<DatosHorario | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCondiciones, setErrorCondiciones] = useState<string | null>(null);
  const [errorHorario, setErrorHorario] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<'condiciones' | 'horario' | 'envio' | null>(null);

  const cargar = useCallback(async () => {
    try {
      const datos = await apiFetch<Relationship>(`/employment-relationships/${id}`);
      setRelacion(datos);
      setCondiciones(condicionesIniciales(datos.conditions));
      setHorario(
        horarioInicial(datos.schedule, datos.conditions?.plannedStartDate.slice(0, 10) ?? ''),
      );
    } catch (causa) {
      setError(errorMessage(causa));
    }
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardarCondiciones(): Promise<void> {
    if (condiciones === null) return;
    setErrorCondiciones(null);
    setAviso(null);
    setGuardando('condiciones');
    try {
      await apiFetch(`/employment-relationships/${id}/conditions`, {
        method: 'PATCH',
        body: condicionesACuerpo(condiciones),
      });
      setAviso('Guardamos las condiciones.');
      await cargar();
    } catch (causa) {
      setErrorCondiciones(errorMessage(causa));
    } finally {
      setGuardando(null);
    }
  }

  async function guardarHorario(): Promise<void> {
    if (horario === null) return;
    setErrorHorario(null);
    setAviso(null);
    setGuardando('horario');
    try {
      await apiFetch(`/employment-relationships/${id}/work-schedule`, {
        method: 'PUT',
        body: horarioACuerpo(horario),
      });
      setAviso('Guardamos el horario semanal.');
      await cargar();
    } catch (causa) {
      setErrorHorario(errorMessage(causa));
    } finally {
      setGuardando(null);
    }
  }

  async function enviar(): Promise<void> {
    setError(null);
    setAviso(null);
    setGuardando('envio');
    try {
      await apiFetch(`/employment-relationships/${id}/submit`, { method: 'POST', body: {} });
      setAviso('Le enviamos las condiciones a la trabajadora para que las revise.');
      await cargar();
    } catch (causa) {
      setError(errorMessage(causa));
    } finally {
      setGuardando(null);
    }
  }

  if (error !== null && relacion === null) {
    return (
      <div className="tarjeta">
        <Error mensaje={error} />
        <Link className="boton boton--secundario" href="/familia">
          Volver al panel
        </Link>
      </div>
    );
  }

  if (relacion === null || condiciones === null || horario === null) {
    return <Cargando que="la relación laboral" />;
  }

  const editable =
    relacion.status === 'PENDING_CONFIGURATION' || relacion.status === 'PENDING_WORKER_ACCEPTANCE';
  const puedeEnviar =
    relacion.status === 'PENDING_CONFIGURATION' &&
    relacion.conditions !== null &&
    relacion.schedule !== null;

  return (
    <div className="pila">
      <div className="entre">
        <h1>{relacion.worker?.name ?? 'Relación laboral'}</h1>
        <Link className="boton boton--secundario" href="/familia">
          Volver al panel
        </Link>
      </div>

      <Error mensaje={error} />
      <Exito mensaje={aviso} />

      {!editable && <ResumenRelacion relacion={relacion} />}

      {editable && (
        <>
          <section className="tarjeta">
            <h2>1. Condiciones acordadas</h2>
            <FormularioCondiciones
              datos={condiciones}
              onCambio={setCondiciones}
              onEnviar={guardarCondiciones}
              error={errorCondiciones}
              enviando={guardando === 'condiciones'}
            />
          </section>

          <section className="tarjeta">
            <h2>2. Horario semanal</h2>
            {relacion.conditions === null ? (
              <p className="suave">Guardá primero las condiciones para configurar el horario.</p>
            ) : (
              <FormularioHorario
                datos={horario}
                onCambio={setHorario}
                onEnviar={guardarHorario}
                error={errorHorario}
                enviando={guardando === 'horario'}
              />
            )}
          </section>

          <section className="tarjeta">
            <h2>3. Enviar a la trabajadora</h2>

            {relacion.status === 'PENDING_WORKER_ACCEPTANCE' ? (
              <p>
                Ya le enviamos las condiciones. Estamos esperando que las acepte. Si cambiás algo
                acá arriba, vas a tener que enviárselas de nuevo.
              </p>
            ) : (
              <>
                <p className="suave">
                  Cuando estés conforme, enviáselas para que las revise. Vos no podés activar la
                  relación: queda activa recién cuando ella acepta.
                </p>
                <ul className="suave">
                  <li>Condiciones cargadas: {relacion.conditions === null ? 'falta' : 'listo'}</li>
                  <li>Horario cargado: {relacion.schedule === null ? 'falta' : 'listo'}</li>
                </ul>
                <button
                  type="button"
                  className="boton"
                  disabled={!puedeEnviar || guardando !== null}
                  onClick={() => void enviar()}
                >
                  {guardando === 'envio' ? 'Enviando…' : 'Enviar a la trabajadora'}
                </button>
              </>
            )}
          </section>

          <details className="tarjeta">
            <summary>Ver el resumen tal como lo va a ver la trabajadora</summary>
            <div style={{ marginTop: '1rem' }}>
              <ResumenRelacion relacion={relacion} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}
