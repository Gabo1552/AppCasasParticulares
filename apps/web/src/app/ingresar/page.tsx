'use client';

import { Suspense, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/api';
import { useSession } from '@/components/session-provider';
import { Campo, Cargando, Error } from '@/components/ui';

/**
 * Ingreso por código de un solo uso.
 *
 * Dos pasos en una misma pantalla: pedir el código y escribirlo. No hay
 * contraseña que recordar ni que perder, y no hay nada que robar de una base de
 * datos de contraseñas que no existe.
 *
 * El mensaje tras pedir el código es siempre el mismo, exista o no la cuenta:
 * si dijera "no encontramos ese correo", cualquiera podría averiguar quién está
 * registrado probando direcciones.
 */
export default function IngresarPage(): ReactNode {
  return (
    <Suspense fallback={<Cargando />}>
      <Ingresar />
    </Suspense>
  );
}

function Ingresar(): ReactNode {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { recargar } = useSession();

  const invitacion = searchParams.get('invitacion');
  const correoSugerido = searchParams.get('correo') ?? '';
  const destino = searchParams.get('destino');

  const [paso, setPaso] = useState<'correo' | 'codigo'>('correo');
  const [email, setEmail] = useState(correoSugerido);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function pedirCodigo(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await apiFetch('/auth/request-code', { method: 'POST', body: { email } });
      setPaso('codigo');
    } catch (causa) {
      setError(errorMessage(causa));
    } finally {
      setEnviando(false);
    }
  }

  async function verificarCodigo(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await apiFetch('/auth/verify-code', {
        method: 'POST',
        body: {
          email,
          code: codigo,
          ...(invitacion === null ? {} : { invitationToken: invitacion }),
        },
      });
      await recargar();
      router.replace(destino ?? '/onboarding');
    } catch (causa) {
      setError(errorMessage(causa));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="contenido--angosto">
      <div className="tarjeta">
        <h1>Ingresar</h1>

        {paso === 'correo' ? (
          <form onSubmit={(event) => void pedirCodigo(event)} noValidate>
            <p className="suave">
              Escribí tu correo y te enviamos un código de 6 dígitos. Si es tu primera vez, la
              cuenta se crea sola.
            </p>

            <Error mensaje={error} />

            <Campo etiqueta="Correo electrónico">
              {(id) => (
                <input
                  id={id}
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                  }}
                />
              )}
            </Campo>

            <button className="boton" type="submit" disabled={enviando || email.length === 0}>
              {enviando ? 'Enviando…' : 'Enviarme el código'}
            </button>
          </form>
        ) : (
          <form onSubmit={(event) => void verificarCodigo(event)} noValidate>
            <p className="suave">
              Si <strong>{email}</strong> tiene una cuenta o puede crear una, te enviamos un código.
              Revisá tu correo y escribilo acá. Vence en 10 minutos.
            </p>

            <Error mensaje={error} />

            <Campo etiqueta="Código de 6 dígitos" ayuda="Sólo números.">
              {(id) => (
                <input
                  id={id}
                  type="text"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  pattern="\d{6}"
                  required
                  value={codigo}
                  onChange={(event) => {
                    setCodigo(event.target.value.replace(/\D/g, ''));
                  }}
                />
              )}
            </Campo>

            <div className="fila">
              <button className="boton" type="submit" disabled={enviando || codigo.length !== 6}>
                {enviando ? 'Verificando…' : 'Ingresar'}
              </button>
              <button
                className="boton boton--secundario"
                type="button"
                disabled={enviando}
                onClick={() => {
                  setPaso('correo');
                  setCodigo('');
                  setError(null);
                }}
              >
                Usar otro correo
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
