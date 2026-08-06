'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/api';
import { PantallaProtegida } from '@/components/pantalla-protegida';
import { BotonConfirmacion, Cargando, Error, Etiqueta, Exito, Vacio } from '@/components/ui';
import { etiquetaInvitacion, formatearFecha, formatearFechaHora } from '@/lib/format';
import type { Invitation, InvitationStatus } from '@/lib/types';

export default function Invitaciones(): ReactNode {
  return (
    <PantallaProtegida rol="FAMILY_EMPLOYER">
      <Suspense fallback={<Cargando que="tus invitaciones" />}>
        <Contenido />
      </Suspense>
    </PantallaProtegida>
  );
}

function Contenido(): ReactNode {
  const searchParams = useSearchParams();
  const [invitaciones, setInvitaciones] = useState<Invitation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(
    searchParams.get('enviada') === '1' ? 'Enviamos la invitación por correo.' : null,
  );

  const cargar = useCallback(async () => {
    try {
      setInvitaciones(await apiFetch<Invitation[]>('/worker-invitations'));
    } catch (causa) {
      setError(errorMessage(causa));
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function revocar(id: string): Promise<void> {
    setError(null);
    setAviso(null);
    try {
      await apiFetch(`/worker-invitations/${id}/revoke`, { method: 'POST', body: {} });
      setAviso('Dimos de baja la invitación. El enlace anterior dejó de servir.');
      await cargar();
    } catch (causa) {
      setError(errorMessage(causa));
    }
  }

  async function reenviar(id: string): Promise<void> {
    setError(null);
    setAviso(null);
    try {
      await apiFetch(`/worker-invitations/${id}/resend`, { method: 'POST', body: {} });
      setAviso('Reenviamos la invitación con un enlace nuevo. El anterior ya no sirve.');
      await cargar();
    } catch (causa) {
      setError(errorMessage(causa));
    }
  }

  if (invitaciones === null && error === null) return <Cargando que="tus invitaciones" />;

  return (
    <div className="pila">
      <div className="entre">
        <h1>Invitaciones</h1>
        <Link className="boton" href="/familia/invitaciones/nueva">
          Invitar
        </Link>
      </div>

      <Error mensaje={error} />
      <Exito mensaje={aviso} />

      {invitaciones !== null && invitaciones.length === 0 ? (
        <Vacio>Todavía no enviaste ninguna invitación.</Vacio>
      ) : (
        (invitaciones ?? []).map((invitacion) => (
          <article className="tarjeta" key={invitacion.id}>
            <div className="entre">
              <div>
                <h2>{invitacion.workerName ?? invitacion.workerEmail}</h2>
                {invitacion.workerName !== null && (
                  <p className="suave">{invitacion.workerEmail}</p>
                )}
              </div>
              <Etiqueta
                texto={etiquetaInvitacion(invitacion.status)}
                tono={tonoInvitacion(invitacion.status)}
              />
            </div>

            <dl className="datos">
              <div>
                <dt>Domicilio</dt>
                <dd>{invitacion.householdLabel}</dd>
              </div>
              <div>
                <dt>Enviada</dt>
                <dd>{formatearFechaHora(invitacion.sentAt)}</dd>
              </div>
              <div>
                <dt>Vence</dt>
                <dd>{formatearFecha(invitacion.expiresAt)}</dd>
              </div>
              {invitacion.resentCount > 0 && (
                <div>
                  <dt>Reenvíos</dt>
                  <dd>{invitacion.resentCount}</dd>
                </div>
              )}
            </dl>

            <div className="tarjeta__pie">
              {invitacion.status === 'PENDING' && (
                <>
                  <button
                    type="button"
                    className="boton boton--secundario"
                    onClick={() => void reenviar(invitacion.id)}
                  >
                    Reenviar
                  </button>
                  <BotonConfirmacion
                    pregunta="¿Dar de baja esta invitación?"
                    onConfirmar={() => revocar(invitacion.id)}
                  >
                    Dar de baja
                  </BotonConfirmacion>
                </>
              )}
              {invitacion.employmentRelationshipId !== null && (
                <Link
                  className="boton"
                  href={`/familia/relaciones/${invitacion.employmentRelationshipId}`}
                >
                  Ver la relación laboral
                </Link>
              )}
            </div>
          </article>
        ))
      )}
    </div>
  );
}

function tonoInvitacion(status: InvitationStatus): 'activa' | 'espera' | 'cerrada' {
  if (status === 'ACCEPTED') return 'activa';
  if (status === 'PENDING') return 'espera';
  return 'cerrada';
}
