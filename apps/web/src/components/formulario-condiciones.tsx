'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { AvisoDatosDePrueba, Campo, Error } from '@/components/ui';
import type { Conditions } from '@/lib/types';

/**
 * Condiciones acordadas de la relación laboral.
 *
 * La remuneración se maneja **siempre como texto**. Nunca pasa por `number`: en
 * JSON y en punto flotante, 350000.10 no es exactamente 350000.10, y un importe
 * que se corre un centavo en cada guardado es un error que aparece meses después
 * y nadie sabe de dónde salió (RN-13).
 *
 * Las categorías son un fixture de prueba, no una escala oficial. La pantalla lo
 * dice de forma visible porque nadie debería tomar de acá un valor para liquidar.
 */

const CATEGORIAS = [
  { codigo: 'TAREAS_GENERALES', texto: 'Tareas generales' },
  { codigo: 'CASEROS', texto: 'Caseros' },
  { codigo: 'CUIDADO_DE_PERSONAS', texto: 'Cuidado de personas' },
  { codigo: 'ASISTENCIA_Y_CUIDADO', texto: 'Asistencia y cuidado' },
  { codigo: 'SUPERVISION', texto: 'Supervisión' },
];

export interface DatosCondiciones {
  plannedStartDate: string;
  categoryCode: string;
  liveInMode: 'WITH_WITHDRAWAL' | 'WITHOUT_WITHDRAWAL';
  remunerationScheme: 'MONTHLY' | 'HOURLY';
  agreedRemuneration: string;
  weeklyHours: string;
  paymentDayOfMonth: string;
  requiresProfessionalReview: boolean;
  adminNotes: string;
}

export function condicionesIniciales(condiciones?: Conditions | null): DatosCondiciones {
  return {
    plannedStartDate: condiciones?.plannedStartDate.slice(0, 10) ?? '',
    categoryCode: condiciones?.categoryCode ?? 'TAREAS_GENERALES',
    liveInMode:
      (condiciones?.liveInMode as DatosCondiciones['liveInMode'] | undefined) ?? 'WITH_WITHDRAWAL',
    remunerationScheme:
      (condiciones?.remunerationScheme as DatosCondiciones['remunerationScheme'] | undefined) ??
      'MONTHLY',
    agreedRemuneration: condiciones?.agreedRemuneration ?? '',
    weeklyHours: condiciones?.weeklyHours?.toString() ?? '',
    paymentDayOfMonth: condiciones?.paymentDayOfMonth?.toString() ?? '',
    requiresProfessionalReview: condiciones?.requiresProfessionalReview ?? false,
    adminNotes: condiciones?.adminNotes ?? '',
  };
}

export function condicionesACuerpo(datos: DatosCondiciones): Record<string, unknown> {
  const cuerpo: Record<string, unknown> = {
    plannedStartDate: datos.plannedStartDate,
    categoryCode: datos.categoryCode,
    liveInMode: datos.liveInMode,
    remunerationScheme: datos.remunerationScheme,
    // Se normaliza la coma decimal a punto, pero sigue siendo string de punta a punta.
    agreedRemuneration: datos.agreedRemuneration.trim().replace(',', '.'),
    weeklyHours: Number(datos.weeklyHours),
    requiresProfessionalReview: datos.requiresProfessionalReview,
  };
  if (datos.paymentDayOfMonth.trim().length > 0) {
    cuerpo['paymentDayOfMonth'] = Number(datos.paymentDayOfMonth);
  }
  if (datos.adminNotes.trim().length > 0) cuerpo['adminNotes'] = datos.adminNotes.trim();
  return cuerpo;
}

interface Props {
  datos: DatosCondiciones;
  onCambio: (datos: DatosCondiciones) => void;
  onEnviar: () => Promise<void>;
  error: string | null;
  enviando: boolean;
  children?: ReactNode;
}

export function FormularioCondiciones({
  datos,
  onCambio,
  onEnviar,
  error,
  enviando,
  children,
}: Props): ReactNode {
  const [tocado, setTocado] = useState(false);

  const importeValido = /^\d+([.,]\d{1,2})?$/.test(datos.agreedRemuneration.trim());
  const completo =
    datos.plannedStartDate.length > 0 &&
    importeValido &&
    Number(datos.weeklyHours) >= 1 &&
    Number(datos.weeklyHours) <= 168;

  function actualizar<K extends keyof DatosCondiciones>(
    campo: K,
    valor: DatosCondiciones[K],
  ): void {
    onCambio({ ...datos, [campo]: valor });
  }

  function enviar(event: FormEvent): void {
    event.preventDefault();
    setTocado(true);
    if (!completo) return;
    void onEnviar();
  }

  return (
    <form onSubmit={enviar} noValidate>
      <AvisoDatosDePrueba />
      <Error mensaje={error} />

      <Campo etiqueta="Fecha prevista de inicio">
        {(id) => (
          <input
            id={id}
            name="plannedStartDate"
            type="date"
            required
            value={datos.plannedStartDate}
            aria-invalid={tocado && datos.plannedStartDate.length === 0}
            onChange={(event) => {
              actualizar('plannedStartDate', event.target.value);
            }}
          />
        )}
      </Campo>

      <Campo
        etiqueta="Categoría de tareas"
        ayuda="Las categorías cargadas son de prueba y no reemplazan la clasificación oficial."
      >
        {(id) => (
          <select
            id={id}
            name="categoryCode"
            value={datos.categoryCode}
            onChange={(event) => {
              actualizar('categoryCode', event.target.value);
            }}
          >
            {CATEGORIAS.map((categoria) => (
              <option key={categoria.codigo} value={categoria.codigo}>
                {categoria.texto}
              </option>
            ))}
          </select>
        )}
      </Campo>

      <Campo etiqueta="Modalidad">
        {(id) => (
          <select
            id={id}
            name="liveInMode"
            value={datos.liveInMode}
            onChange={(event) => {
              actualizar('liveInMode', event.target.value as DatosCondiciones['liveInMode']);
            }}
          >
            <option value="WITH_WITHDRAWAL">Con retiro (se retira al terminar la jornada)</option>
            <option value="WITHOUT_WITHDRAWAL">Sin retiro (reside en el domicilio)</option>
          </select>
        )}
      </Campo>

      <Campo etiqueta="Forma de la remuneración">
        {(id) => (
          <select
            id={id}
            name="remunerationScheme"
            value={datos.remunerationScheme}
            onChange={(event) => {
              actualizar(
                'remunerationScheme',
                event.target.value as DatosCondiciones['remunerationScheme'],
              );
            }}
          >
            <option value="MONTHLY">Mensual</option>
            <option value="HOURLY">Por hora</option>
          </select>
        )}
      </Campo>

      <Campo
        etiqueta={
          datos.remunerationScheme === 'MONTHLY'
            ? 'Remuneración mensual acordada (ARS)'
            : 'Valor por hora acordado (ARS)'
        }
        ayuda="Escribí el monto acordado entre las partes. Ejemplo: 350000.00"
      >
        {(id) => (
          <input
            id={id}
            name="agreedRemuneration"
            type="text"
            inputMode="decimal"
            required
            value={datos.agreedRemuneration}
            aria-invalid={tocado && !importeValido}
            onChange={(event) => {
              actualizar('agreedRemuneration', event.target.value);
            }}
          />
        )}
      </Campo>

      <Campo etiqueta="Horas semanales estimadas">
        {(id) => (
          <input
            id={id}
            name="weeklyHours"
            type="number"
            min={1}
            max={168}
            required
            value={datos.weeklyHours}
            aria-invalid={tocado && Number(datos.weeklyHours) < 1}
            onChange={(event) => {
              actualizar('weeklyHours', event.target.value);
            }}
          />
        )}
      </Campo>

      <Campo etiqueta="Día de pago habitual (opcional)" ayuda="Día del mes, del 1 al 31.">
        {(id) => (
          <input
            id={id}
            name="paymentDayOfMonth"
            type="number"
            min={1}
            max={31}
            value={datos.paymentDayOfMonth}
            onChange={(event) => {
              actualizar('paymentDayOfMonth', event.target.value);
            }}
          />
        )}
      </Campo>

      <label className="campo campo--casilla">
        <input
          type="checkbox"
          name="requiresProfessionalReview"
          checked={datos.requiresProfessionalReview}
          onChange={(event) => {
            actualizar('requiresProfessionalReview', event.target.checked);
          }}
        />
        <span>
          Quiero que un profesional revise estas condiciones.
          <span className="campo__ayuda">
            Queda marcado para cuando esté disponible el panel del contador.
          </span>
        </span>
      </label>

      <Campo etiqueta="Notas internas (opcional)" ayuda="Sólo las ve la familia.">
        {(id) => (
          <textarea
            id={id}
            name="adminNotes"
            rows={3}
            maxLength={1000}
            value={datos.adminNotes}
            onChange={(event) => {
              actualizar('adminNotes', event.target.value);
            }}
          />
        )}
      </Campo>

      <div className="fila">
        <button className="boton" type="submit" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar condiciones'}
        </button>
        {children}
      </div>
    </form>
  );
}
