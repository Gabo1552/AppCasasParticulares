'use client';

import { useId, useState, type ReactNode } from 'react';

/**
 * Piezas de interfaz compartidas.
 *
 * Cada una existe porque el encargo pide un comportamiento concreto —estados de
 * carga, errores comprensibles, confirmación antes de una acción destructiva—
 * y repetirlo pantalla por pantalla haría que se aplicara sólo a veces.
 */

export function Cargando({ que = 'la información' }: { que?: string }): ReactNode {
  return (
    <p className="cargando" role="status">
      Cargando {que}…
    </p>
  );
}

export function Error({ mensaje }: { mensaje: string | null }): ReactNode {
  if (mensaje === null) return null;
  return (
    <p className="aviso aviso--error" role="alert">
      {mensaje}
    </p>
  );
}

export function Exito({ mensaje }: { mensaje: string | null }): ReactNode {
  if (mensaje === null) return null;
  return (
    <p className="aviso aviso--exito" role="status">
      {mensaje}
    </p>
  );
}

/**
 * Advertencia sobre los parámetros de prueba.
 *
 * El encargo la exige textual en toda pantalla que muestre categorías o montos:
 * nada de lo que calcule el sistema es una liquidación válida hasta que un
 * profesional valide los parámetros.
 */
export function AvisoDatosDePrueba(): ReactNode {
  return (
    <p className="aviso aviso--dato-prueba">
      Los parámetros disponibles son datos de prueba y no constituyen una liquidación oficial.
    </p>
  );
}

export function Vacio({ children }: { children: ReactNode }): ReactNode {
  return <div className="vacio">{children}</div>;
}

interface CampoProps {
  etiqueta: string;
  ayuda?: string;
  children: (id: string) => ReactNode;
}

/** Etiqueta asociada al control por id: sin esto el lector de pantalla no la lee. */
export function Campo({ etiqueta, ayuda, children }: CampoProps): ReactNode {
  const id = useId();
  return (
    <div className="campo">
      <label className="campo__etiqueta" htmlFor={id}>
        {etiqueta}
      </label>
      {children(id)}
      {ayuda !== undefined && <span className="campo__ayuda">{ayuda}</span>}
    </div>
  );
}

export function Etiqueta({
  texto,
  tono,
}: {
  texto: string;
  tono: 'activa' | 'espera' | 'cerrada';
}): ReactNode {
  return <span className={`etiqueta etiqueta--${tono}`}>{texto}</span>;
}

interface BotonConfirmacionProps {
  children: ReactNode;
  pregunta: string;
  onConfirmar: () => void | Promise<void>;
  className?: string;
  disabled?: boolean;
}

/**
 * Botón que pide confirmación antes de ejecutar.
 *
 * Se usa en todo lo que no se puede deshacer con un clic —dar de baja una
 * invitación, archivar un domicilio, rechazar condiciones—. La confirmación es
 * en la propia página y no un `window.confirm`, que no se puede leer con lector
 * de pantalla de forma consistente ni se puede probar en el navegador sin
 * interceptar el diálogo.
 */
export function BotonConfirmacion({
  children,
  pregunta,
  onConfirmar,
  className = 'boton boton--peligro',
  disabled = false,
}: BotonConfirmacionProps): ReactNode {
  const [preguntando, setPreguntando] = useState(false);
  const [enCurso, setEnCurso] = useState(false);

  if (!preguntando) {
    return (
      <button
        type="button"
        className={className}
        disabled={disabled}
        onClick={() => {
          setPreguntando(true);
        }}
      >
        {children}
      </button>
    );
  }

  return (
    <span className="fila" role="group" aria-label="Confirmación">
      <span className="suave">{pregunta}</span>
      <button
        type="button"
        className="boton boton--peligro"
        disabled={enCurso}
        onClick={() => {
          setEnCurso(true);
          void Promise.resolve(onConfirmar()).finally(() => {
            setEnCurso(false);
            setPreguntando(false);
          });
        }}
      >
        {enCurso ? 'Confirmando…' : 'Sí, confirmar'}
      </button>
      <button
        type="button"
        className="boton boton--secundario"
        disabled={enCurso}
        onClick={() => {
          setPreguntando(false);
        }}
      >
        Cancelar
      </button>
    </span>
  );
}

export function Pasos({ actual, total }: { actual: number; total: number }): ReactNode {
  return (
    <p className="pasos">
      Paso {actual} de {total}
    </p>
  );
}
