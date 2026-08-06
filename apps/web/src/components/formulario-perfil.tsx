'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/api';
import { useSession } from '@/components/session-provider';
import { Campo, Error, Pasos } from '@/components/ui';

/**
 * Alta de perfil, igual para familia y para trabajadora.
 *
 * Los dos perfiles piden exactamente lo mismo: nombre, apellido, teléfono, zona
 * horaria y la aceptación de los dos textos. **No se pide clave fiscal, datos
 * bancarios, información impositiva ni documentación de identidad** — nada de eso
 * hace falta para administrar la relación en esta etapa, y lo que no se pide no
 * se puede filtrar.
 */

const ZONAS_HORARIAS = [
  { valor: 'America/Argentina/Buenos_Aires', texto: 'Buenos Aires (GMT-3)' },
  { valor: 'America/Argentina/Cordoba', texto: 'Córdoba (GMT-3)' },
  { valor: 'America/Argentina/Mendoza', texto: 'Mendoza (GMT-3)' },
  { valor: 'America/Argentina/Salta', texto: 'Salta (GMT-3)' },
  { valor: 'America/Argentina/Tucuman', texto: 'Tucumán (GMT-3)' },
  { valor: 'America/Argentina/Ushuaia', texto: 'Ushuaia (GMT-3)' },
];

export function FormularioPerfil({ tipo }: { tipo: 'familia' | 'trabajadora' }): ReactNode {
  const router = useRouter();
  const { recargar } = useSession();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [timezone, setTimezone] = useState('America/Argentina/Buenos_Aires');
  const [terminos, setTerminos] = useState(false);
  const [privacidad, setPrivacidad] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const ruta = tipo === 'familia' ? '/employer-profile' : '/worker-profile';
  const destino = tipo === 'familia' ? '/familia/domicilios/nuevo' : '/trabajadora';
  const completo =
    firstName.trim().length >= 2 &&
    lastName.trim().length >= 2 &&
    phone.trim().length >= 8 &&
    terminos &&
    privacidad;

  async function enviar(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await apiFetch(ruta, {
        method: 'POST',
        body: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          timezone,
          consents: { acceptedTerms: true, acceptedPrivacyPolicy: true },
        },
      });
      // El alta otorga el rol y la API emite una cookie de sesión actualizada;
      // recargar la sesión es lo que hace que la navegación ya muestre el menú.
      await recargar();
      router.replace(destino);
    } catch (causa) {
      setError(errorMessage(causa));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="contenido--angosto">
      <div className="tarjeta">
        {tipo === 'familia' && <Pasos actual={1} total={4} />}
        <h1>Tus datos</h1>
        <p className="suave">
          Sólo pedimos lo necesario para identificarte dentro de la plataforma. No pedimos clave
          fiscal, datos bancarios ni documentación.
        </p>

        <form onSubmit={(event) => void enviar(event)} noValidate>
          <Error mensaje={error} />

          <Campo etiqueta="Nombre">
            {(id) => (
              <input
                id={id}
                name="firstName"
                type="text"
                autoComplete="given-name"
                required
                value={firstName}
                onChange={(event) => {
                  setFirstName(event.target.value);
                }}
              />
            )}
          </Campo>

          <Campo etiqueta="Apellido">
            {(id) => (
              <input
                id={id}
                name="lastName"
                type="text"
                autoComplete="family-name"
                required
                value={lastName}
                onChange={(event) => {
                  setLastName(event.target.value);
                }}
              />
            )}
          </Campo>

          <Campo etiqueta="Teléfono" ayuda="Con característica. Ejemplo: +54 11 5555-1234.">
            {(id) => (
              <input
                id={id}
                name="phone"
                type="tel"
                autoComplete="tel"
                required
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                }}
              />
            )}
          </Campo>

          <Campo etiqueta="Zona horaria">
            {(id) => (
              <select
                id={id}
                name="timezone"
                value={timezone}
                onChange={(event) => {
                  setTimezone(event.target.value);
                }}
              >
                {ZONAS_HORARIAS.map((zona) => (
                  <option key={zona.valor} value={zona.valor}>
                    {zona.texto}
                  </option>
                ))}
              </select>
            )}
          </Campo>

          <fieldset>
            <legend>Términos y privacidad</legend>

            <label className="campo campo--casilla">
              <input
                type="checkbox"
                name="acceptedTerms"
                checked={terminos}
                onChange={(event) => {
                  setTerminos(event.target.checked);
                }}
              />
              <span>
                Acepto los <a href="/legales/terminos">términos y condiciones</a>.
              </span>
            </label>

            <label className="campo campo--casilla">
              <input
                type="checkbox"
                name="acceptedPrivacyPolicy"
                checked={privacidad}
                onChange={(event) => {
                  setPrivacidad(event.target.checked);
                }}
              />
              <span>
                Acepto la <a href="/legales/privacidad">política de privacidad</a>.
              </span>
            </label>

            <p className="campo__ayuda">
              Guardamos la versión exacta del texto que aceptaste y la fecha.
            </p>
          </fieldset>

          <button className="boton" type="submit" disabled={enviando || !completo}>
            {enviando ? 'Guardando…' : 'Crear mi perfil'}
          </button>
        </form>
      </div>
    </div>
  );
}
