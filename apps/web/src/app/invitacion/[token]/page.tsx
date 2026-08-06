'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/api';
import { esTrabajadora, useSession } from '@/components/session-provider';
import { BotonConfirmacion, Cargando, Error, Vacio } from '@/components/ui';
import { formatearFecha } from '@/lib/format';
import type { ResolvedInvitation } from '@/lib/types';

/**
 * Invitación abierta desde el enlace del correo.
 *
 * La pantalla es pública porque quien llega puede no tener sesión todavía. Sólo
 * muestra lo necesario para decidir —quién invita y a qué domicilio—: ni el
 * domicilio exacto ni ningún dato de la familia más allá del nombre.
 *
 * Para aceptar sí hace falta sesión, y con el mismo correo al que se envió la
 * invitación: el enlace identifica la invitación, no autoriza a la persona.
 */
export default function VerInvitacion(): ReactNode {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();
  const { me, cargando: cargandoSesion, recargar } = useSession();

  const [invitacion, setInvitacion] = useState<ResolvedInvitation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setInvitacion(await apiFetch<ResolvedInvitation>(`/worker-invitations/resolve/${token}`));
    } catch (causa) {
      setError(errorMessage(causa));
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function aceptar(): Promise<void> {
    setErrorAccion(null);
    setEnviando(true);
    try {
      const resultado = await apiFetch<{ relationshipId: string }>('/worker-invitations/accept', {
        method: 'POST',
        body: { token },
      });
      await recargar();
      router.replace(`/trabajadora/relaciones/${resultado.relationshipId}`);
    } catch (causa) {
      setErrorAccion(errorMessage(causa));
      setEnviando(false);
    }
  }

  async function rechazar(): Promise<void> {
    setErrorAccion(null);
    setEnviando(true);
    try {
      await apiFetch('/worker-invitations/reject', { method: 'POST', body: { token } });
      await cargar();
    } catch (causa) {
      setErrorAccion(errorMessage(causa));
    } finally {
      setEnviando(false);
    }
  }

  if (error !== null) {
    return (
      <div className="contenido--angosto">
        <div className="tarjeta">
          <h1>No pudimos abrir esta invitación</h1>
          <Error mensaje={error} />
          <p className="suave">
            Puede que el enlace esté incompleto, que se haya reemplazado por uno más nuevo o que ya
            se haya usado. Pedile a la familia que te la envíe de nuevo.
          </p>
          <Link className="boton boton--secundario" href="/">
            Ir al inicio
          </Link>
        </div>
      </div>
    );
  }

  if (invitacion === null || cargandoSesion) return <Cargando que="la invitación" />;

  if (invitacion.status !== 'PENDING') {
    return (
      <div className="contenido--angosto">
        <div className="tarjeta">
          <h1>{tituloCerrada(invitacion.status)}</h1>
          <p>{explicacionCerrada(invitacion.status)}</p>
          <Link className="boton boton--secundario" href="/">
            Ir al inicio
          </Link>
        </div>
      </div>
    );
  }

  const sesionCorrecta = me !== null && me.email?.toLowerCase() === invitacion.workerEmail;

  return (
    <div className="contenido--angosto">
      <div className="tarjeta">
        <h1>Te invitaron a registrar tu trabajo</h1>

        <dl className="datos">
          <div>
            <dt>Quién te invita</dt>
            <dd>{invitacion.employerName}</dd>
          </div>
          <div>
            <dt>Domicilio</dt>
            <dd>
              {invitacion.householdLabel} — {invitacion.householdCity}
            </dd>
          </div>
          <div>
            <dt>Enviada a</dt>
            <dd>{invitacion.workerEmail}</dd>
          </div>
          <div>
            <dt>Vence el</dt>
            <dd>{formatearFecha(invitacion.expiresAt)}</dd>
          </div>
        </dl>

        <Error mensaje={errorAccion} />

        {me === null && (
          <>
            <p>Para aceptar o rechazar, ingresá con el correo al que llegó esta invitación.</p>
            <Link
              className="boton"
              href={`/ingresar?correo=${encodeURIComponent(invitacion.workerEmail)}&destino=${encodeURIComponent(`/invitacion/${token}`)}`}
            >
              Ingresar con {invitacion.workerEmail}
            </Link>
          </>
        )}

        {me !== null && !sesionCorrecta && (
          <Vacio>
            Esta invitación fue enviada a <strong>{invitacion.workerEmail}</strong>, pero ingresaste
            como <strong>{me.email}</strong>. Salí y volvé a ingresar con el correo correcto.
          </Vacio>
        )}

        {sesionCorrecta && !esTrabajadora(me) && (
          <>
            <p>Antes de aceptar necesitás crear tu perfil de trabajadora.</p>
            <Link className="boton" href="/onboarding/trabajadora">
              Crear mi perfil
            </Link>
          </>
        )}

        {sesionCorrecta && esTrabajadora(me) && (
          <>
            <p className="suave">
              Aceptar significa que reconocés esta relación de trabajo. Después vas a ver las
              condiciones que proponga la familia y vas a poder aceptarlas o rechazarlas por
              separado: aceptar la invitación no es aceptar el sueldo ni el horario.
            </p>
            <div className="fila">
              <button
                type="button"
                className="boton"
                disabled={enviando}
                onClick={() => void aceptar()}
              >
                {enviando ? 'Procesando…' : 'Aceptar la invitación'}
              </button>
              <BotonConfirmacion
                pregunta="¿Rechazar esta invitación?"
                disabled={enviando}
                onConfirmar={rechazar}
              >
                Rechazar
              </BotonConfirmacion>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function tituloCerrada(status: string): string {
  if (status === 'EXPIRED') return 'Esta invitación venció';
  if (status === 'REVOKED') return 'Esta invitación fue dada de baja';
  if (status === 'ACCEPTED') return 'Esta invitación ya fue aceptada';
  return 'Esta invitación ya fue respondida';
}

function explicacionCerrada(status: string): string {
  if (status === 'EXPIRED') {
    return 'El enlace tenía una fecha de vencimiento y ya pasó. Pedile a la familia que te envíe una invitación nueva.';
  }
  if (status === 'REVOKED') {
    return 'La familia dio de baja esta invitación. Si fue un error, puede enviarte otra.';
  }
  if (status === 'ACCEPTED') {
    return 'Ya la aceptaste. Ingresá a tu cuenta para ver el estado de la relación laboral.';
  }
  return 'Esta invitación ya no está disponible.';
}
