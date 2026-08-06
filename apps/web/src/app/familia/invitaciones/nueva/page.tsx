'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/api';
import { PantallaProtegida } from '@/components/pantalla-protegida';
import { Campo, Cargando, Error, Pasos, Vacio } from '@/components/ui';
import type { Household } from '@/lib/types';

/**
 * Invitación a una trabajadora.
 *
 * Enviar la invitación **no** crea una relación laboral: crea un enlace que la
 * persona puede aceptar o rechazar. Hasta que lo acepte, no hay nada acordado.
 */
export default function NuevaInvitacion(): ReactNode {
  return (
    <PantallaProtegida rol="FAMILY_EMPLOYER">
      <Contenido />
    </PantallaProtegida>
  );
}

function Contenido(): ReactNode {
  const router = useRouter();
  const [domicilios, setDomicilios] = useState<Household[] | null>(null);
  const [householdId, setHouseholdId] = useState('');
  const [workerEmail, setWorkerEmail] = useState('');
  const [workerName, setWorkerName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    async function cargar(): Promise<void> {
      try {
        const lista = await apiFetch<Household[]>('/households');
        const activos = lista.filter((domicilio) => domicilio.isActive);
        setDomicilios(activos);
        if (activos[0] !== undefined) setHouseholdId(activos[0].id);
      } catch (causa) {
        setError(errorMessage(causa));
      }
    }
    void cargar();
  }, []);

  async function enviar(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await apiFetch('/worker-invitations', {
        method: 'POST',
        body: {
          householdId,
          workerEmail: workerEmail.trim(),
          expiresInDays,
          ...(workerName.trim().length === 0 ? {} : { workerName: workerName.trim() }),
        },
      });
      router.push('/familia/invitaciones?enviada=1');
    } catch (causa) {
      setError(errorMessage(causa));
    } finally {
      setEnviando(false);
    }
  }

  if (domicilios === null && error === null) return <Cargando que="tus domicilios" />;

  if (domicilios !== null && domicilios.length === 0) {
    return (
      <div className="tarjeta">
        <h1>Primero cargá un domicilio</h1>
        <p>Para invitar a alguien necesitás tener al menos un domicilio activo.</p>
        <Link className="boton" href="/familia/domicilios/nuevo">
          Agregar un domicilio
        </Link>
      </div>
    );
  }

  return (
    <div className="contenido--angosto">
      <div className="tarjeta">
        <Pasos actual={3} total={4} />
        <h1>Invitá a la trabajadora</h1>
        <p className="suave">
          Le enviamos un correo con un enlace para que se registre y vea de qué se trata. La
          invitación por sí sola no crea ninguna relación laboral: la persona tiene que aceptarla.
        </p>

        <form onSubmit={(event) => void enviar(event)} noValidate>
          <Error mensaje={error} />

          <Campo etiqueta="Domicilio donde va a trabajar">
            {(id) => (
              <select
                id={id}
                name="householdId"
                required
                value={householdId}
                onChange={(event) => {
                  setHouseholdId(event.target.value);
                }}
              >
                {(domicilios ?? []).map((domicilio) => (
                  <option key={domicilio.id} value={domicilio.id}>
                    {domicilio.label} — {domicilio.city}
                  </option>
                ))}
              </select>
            )}
          </Campo>

          <Campo
            etiqueta="Correo de la trabajadora"
            ayuda="Tiene que ser el correo con el que ella va a ingresar."
          >
            {(id) => (
              <input
                id={id}
                name="workerEmail"
                type="email"
                inputMode="email"
                required
                value={workerEmail}
                onChange={(event) => {
                  setWorkerEmail(event.target.value);
                }}
              />
            )}
          </Campo>

          <Campo etiqueta="Nombre (opcional)" ayuda="Sirve para reconocer la invitación después.">
            {(id) => (
              <input
                id={id}
                name="workerName"
                type="text"
                value={workerName}
                onChange={(event) => {
                  setWorkerName(event.target.value);
                }}
              />
            )}
          </Campo>

          <Campo etiqueta="Días de validez del enlace">
            {(id) => (
              <input
                id={id}
                name="expiresInDays"
                type="number"
                min={1}
                max={30}
                required
                value={expiresInDays}
                onChange={(event) => {
                  setExpiresInDays(Number(event.target.value));
                }}
              />
            )}
          </Campo>

          <div className="fila">
            <button
              className="boton"
              type="submit"
              disabled={enviando || workerEmail.trim().length === 0 || householdId.length === 0}
            >
              {enviando ? 'Enviando…' : 'Enviar invitación'}
            </button>
            <Link className="boton boton--secundario" href="/familia">
              Cancelar
            </Link>
          </div>
        </form>
      </div>

      <Vacio>
        El enlace se puede usar una sola vez y vence solo. Si te equivocaste de correo, podés darla
        de baja y enviar otra.
      </Vacio>
    </div>
  );
}
