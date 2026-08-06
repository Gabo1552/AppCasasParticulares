'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { Campo, Error, Pasos } from '@/components/ui';
import type { Household } from '@/lib/types';

/**
 * Alta y edición del domicilio de trabajo.
 *
 * No pide coordenadas ni permiso de ubicación: la geolocalización llega recién
 * con el fichaje, y sólo durante el fichaje. Pedirla antes sería recolectar un
 * dato sensible que hoy no tiene ningún uso.
 */

export interface DatosDomicilio {
  label: string;
  street: string;
  streetNumber: string;
  floor: string;
  apartment: string;
  city: string;
  province: string;
  postalCode: string;
  timezone: string;
  accessInstructions: string;
}

const PROVINCIAS = [
  'Ciudad Autónoma de Buenos Aires',
  'Buenos Aires',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego',
  'Tucumán',
];

export function datosIniciales(domicilio?: Household): DatosDomicilio {
  return {
    label: domicilio?.label ?? '',
    street: domicilio?.street ?? '',
    streetNumber: domicilio?.streetNumber ?? '',
    floor: domicilio?.floor ?? '',
    apartment: domicilio?.apartment ?? '',
    city: domicilio?.city ?? '',
    province: domicilio?.province ?? 'Ciudad Autónoma de Buenos Aires',
    postalCode: domicilio?.postalCode ?? '',
    timezone: domicilio?.timezone ?? 'America/Argentina/Buenos_Aires',
    accessInstructions: domicilio?.accessInstructions ?? '',
  };
}

/** Quita los opcionales vacíos: la API los rechaza si llegan como cadena vacía. */
export function aCuerpo(datos: DatosDomicilio): Record<string, unknown> {
  const cuerpo: Record<string, unknown> = {
    label: datos.label.trim(),
    street: datos.street.trim(),
    streetNumber: datos.streetNumber.trim(),
    city: datos.city.trim(),
    province: datos.province,
    postalCode: datos.postalCode.trim(),
    timezone: datos.timezone,
  };
  if (datos.floor.trim().length > 0) cuerpo['floor'] = datos.floor.trim();
  if (datos.apartment.trim().length > 0) cuerpo['apartment'] = datos.apartment.trim();
  if (datos.accessInstructions.trim().length > 0) {
    cuerpo['accessInstructions'] = datos.accessInstructions.trim();
  }
  return cuerpo;
}

interface Props {
  titulo: string;
  paso?: { actual: number; total: number };
  datos: DatosDomicilio;
  onCambio: (datos: DatosDomicilio) => void;
  onEnviar: () => Promise<void>;
  error: string | null;
  enviando: boolean;
  textoBoton: string;
  children?: ReactNode;
}

export function FormularioDomicilio({
  titulo,
  paso,
  datos,
  onCambio,
  onEnviar,
  error,
  enviando,
  textoBoton,
  children,
}: Props): ReactNode {
  const [tocado, setTocado] = useState(false);

  const completo =
    datos.label.trim().length >= 2 &&
    datos.street.trim().length >= 2 &&
    datos.streetNumber.trim().length >= 1 &&
    datos.city.trim().length >= 2 &&
    datos.postalCode.trim().length >= 4;

  function actualizar(campo: keyof DatosDomicilio, valor: string): void {
    onCambio({ ...datos, [campo]: valor });
  }

  function enviar(event: FormEvent): void {
    event.preventDefault();
    setTocado(true);
    if (!completo) return;
    void onEnviar();
  }

  return (
    <div className="contenido--angosto">
      <div className="tarjeta">
        {paso !== undefined && <Pasos actual={paso.actual} total={paso.total} />}
        <h1>{titulo}</h1>

        <form onSubmit={enviar} noValidate>
          <Error mensaje={error} />

          <Campo
            etiqueta="Alias del domicilio"
            ayuda="Cómo lo reconocés vos. Por ejemplo: «Casa», «Depto de mamá»."
          >
            {(id) => (
              <input
                id={id}
                name="label"
                type="text"
                required
                value={datos.label}
                aria-invalid={tocado && datos.label.trim().length < 2}
                onChange={(event) => {
                  actualizar('label', event.target.value);
                }}
              />
            )}
          </Campo>

          <Campo etiqueta="Calle">
            {(id) => (
              <input
                id={id}
                name="street"
                type="text"
                autoComplete="address-line1"
                required
                value={datos.street}
                aria-invalid={tocado && datos.street.trim().length < 2}
                onChange={(event) => {
                  actualizar('street', event.target.value);
                }}
              />
            )}
          </Campo>

          <div className="fila">
            <div style={{ flex: '1 1 8rem' }}>
              <Campo etiqueta="Número">
                {(id) => (
                  <input
                    id={id}
                    name="streetNumber"
                    type="text"
                    inputMode="numeric"
                    required
                    value={datos.streetNumber}
                    aria-invalid={tocado && datos.streetNumber.trim().length < 1}
                    onChange={(event) => {
                      actualizar('streetNumber', event.target.value);
                    }}
                  />
                )}
              </Campo>
            </div>
            <div style={{ flex: '1 1 6rem' }}>
              <Campo etiqueta="Piso (opcional)">
                {(id) => (
                  <input
                    id={id}
                    name="floor"
                    type="text"
                    value={datos.floor}
                    onChange={(event) => {
                      actualizar('floor', event.target.value);
                    }}
                  />
                )}
              </Campo>
            </div>
            <div style={{ flex: '1 1 6rem' }}>
              <Campo etiqueta="Depto (opcional)">
                {(id) => (
                  <input
                    id={id}
                    name="apartment"
                    type="text"
                    value={datos.apartment}
                    onChange={(event) => {
                      actualizar('apartment', event.target.value);
                    }}
                  />
                )}
              </Campo>
            </div>
          </div>

          <Campo etiqueta="Localidad">
            {(id) => (
              <input
                id={id}
                name="city"
                type="text"
                autoComplete="address-level2"
                required
                value={datos.city}
                aria-invalid={tocado && datos.city.trim().length < 2}
                onChange={(event) => {
                  actualizar('city', event.target.value);
                }}
              />
            )}
          </Campo>

          <Campo etiqueta="Provincia">
            {(id) => (
              <select
                id={id}
                name="province"
                value={datos.province}
                onChange={(event) => {
                  actualizar('province', event.target.value);
                }}
              >
                {PROVINCIAS.map((provincia) => (
                  <option key={provincia} value={provincia}>
                    {provincia}
                  </option>
                ))}
              </select>
            )}
          </Campo>

          <Campo etiqueta="Código postal">
            {(id) => (
              <input
                id={id}
                name="postalCode"
                type="text"
                autoComplete="postal-code"
                required
                value={datos.postalCode}
                aria-invalid={tocado && datos.postalCode.trim().length < 4}
                onChange={(event) => {
                  actualizar('postalCode', event.target.value);
                }}
              />
            )}
          </Campo>

          <Campo
            etiqueta="Indicaciones para llegar o entrar (opcional)"
            ayuda="Por ejemplo: «Timbre 4B», «Portón negro al lado del kiosco»."
          >
            {(id) => (
              <textarea
                id={id}
                name="accessInstructions"
                rows={3}
                maxLength={500}
                value={datos.accessInstructions}
                onChange={(event) => {
                  actualizar('accessInstructions', event.target.value);
                }}
              />
            )}
          </Campo>

          <p className="campo__ayuda">
            El país queda fijo en Argentina. No guardamos la ubicación del domicilio en un mapa.
          </p>

          <div className="fila" style={{ marginTop: '1rem' }}>
            <button className="boton" type="submit" disabled={enviando}>
              {enviando ? 'Guardando…' : textoBoton}
            </button>
            {children}
          </div>
        </form>
      </div>
    </div>
  );
}
