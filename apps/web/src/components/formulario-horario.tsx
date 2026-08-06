'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { Error } from '@/components/ui';
import { formatearHoras, nombreDia } from '@/lib/format';
import type { Schedule } from '@/lib/types';

/**
 * Horario semanal previsto.
 *
 * Un bloque por día, con pausa opcional. Un solo bloque por día es lo que impide
 * los solapamientos por construcción: no hace falta validar cruces si no puede
 * haber dos franjas el mismo día.
 *
 * El total semanal se muestra mientras se edita, porque es el número que la
 * familia y la trabajadora van a comparar con lo que acordaron de palabra.
 */

export interface DiaHorario {
  activo: boolean;
  startTime: string;
  endTime: string;
  breakMinutes: string;
}

export type DatosHorario = {
  effectiveFrom: string;
  dias: DiaHorario[];
};

const DIA_VACIO: DiaHorario = {
  activo: false,
  startTime: '09:00',
  endTime: '15:00',
  breakMinutes: '0',
};

export function horarioInicial(schedule: Schedule | null, inicio: string): DatosHorario {
  const dias: DiaHorario[] = Array.from({ length: 7 }, () => ({ ...DIA_VACIO }));

  for (const dia of schedule?.days ?? []) {
    dias[dia.dayOfWeek] = {
      activo: true,
      startTime: dia.startTime,
      endTime: dia.endTime,
      breakMinutes: String(dia.breakMinutes),
    };
  }

  return { effectiveFrom: schedule?.effectiveFrom.slice(0, 10) ?? inicio, dias };
}

export function horarioACuerpo(datos: DatosHorario): Record<string, unknown> {
  return {
    effectiveFrom: datos.effectiveFrom,
    days: datos.dias
      .map((dia, dayOfWeek) => ({ dia, dayOfWeek }))
      .filter(({ dia }) => dia.activo)
      .map(({ dia, dayOfWeek }) => ({
        dayOfWeek,
        startTime: dia.startTime,
        endTime: dia.endTime,
        breakMinutes: Number(dia.breakMinutes || '0'),
      })),
  };
}

function minutos(hora: string): number {
  const [h = '0', m = '0'] = hora.split(':');
  return Number(h) * 60 + Number(m);
}

/** Minutos trabajados de un día, o `null` si el bloque es inválido. */
function minutosDelDia(dia: DiaHorario): number | null {
  const duracion = minutos(dia.endTime) - minutos(dia.startTime);
  const pausa = Number(dia.breakMinutes || '0');
  if (duracion <= 0) return null;
  if (pausa >= duracion) return null;
  return duracion - pausa;
}

interface Props {
  datos: DatosHorario;
  onCambio: (datos: DatosHorario) => void;
  onEnviar: () => Promise<void>;
  error: string | null;
  enviando: boolean;
  children?: ReactNode;
}

export function FormularioHorario({
  datos,
  onCambio,
  onEnviar,
  error,
  enviando,
  children,
}: Props): ReactNode {
  const [tocado, setTocado] = useState(false);

  const activos = datos.dias.filter((dia) => dia.activo);
  const invalidos = activos.filter((dia) => minutosDelDia(dia) === null);
  const totalMinutos = activos.reduce((total, dia) => total + (minutosDelDia(dia) ?? 0), 0);
  const completo = activos.length > 0 && invalidos.length === 0 && datos.effectiveFrom.length > 0;

  function actualizarDia(indice: number, cambios: Partial<DiaHorario>): void {
    const dias = datos.dias.map((dia, i) => (i === indice ? { ...dia, ...cambios } : dia));
    onCambio({ ...datos, dias });
  }

  function enviar(event: FormEvent): void {
    event.preventDefault();
    setTocado(true);
    if (!completo) return;
    void onEnviar();
  }

  return (
    <form onSubmit={enviar} noValidate>
      <Error mensaje={error} />

      {tocado && activos.length === 0 && (
        <p className="aviso aviso--error" role="alert">
          Marcá al menos un día de trabajo.
        </p>
      )}
      {tocado && invalidos.length > 0 && (
        <p className="aviso aviso--error" role="alert">
          Revisá los días marcados: la hora de salida tiene que ser posterior a la de entrada y la
          pausa no puede durar tanto como la jornada.
        </p>
      )}

      <div className="tabla-envoltorio">
        <table>
          <thead>
            <tr>
              <th scope="col">Día</th>
              <th scope="col">Entrada</th>
              <th scope="col">Salida</th>
              <th scope="col">Pausa (min)</th>
              <th scope="col">Trabaja</th>
            </tr>
          </thead>
          <tbody>
            {datos.dias.map((dia, indice) => {
              const trabajados = minutosDelDia(dia);
              return (
                <tr key={indice}>
                  <th scope="row">
                    <label className="campo--casilla" style={{ marginBottom: 0 }}>
                      <input
                        type="checkbox"
                        name={`dia-${indice}`}
                        aria-label={`Trabaja el ${nombreDia(indice)}`}
                        checked={dia.activo}
                        onChange={(event) => {
                          actualizarDia(indice, { activo: event.target.checked });
                        }}
                      />
                      <span style={{ textTransform: 'capitalize' }}>{nombreDia(indice)}</span>
                    </label>
                  </th>
                  <td>
                    <input
                      type="time"
                      aria-label={`Entrada del ${nombreDia(indice)}`}
                      disabled={!dia.activo}
                      value={dia.startTime}
                      onChange={(event) => {
                        actualizarDia(indice, { startTime: event.target.value });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      aria-label={`Salida del ${nombreDia(indice)}`}
                      disabled={!dia.activo}
                      value={dia.endTime}
                      onChange={(event) => {
                        actualizarDia(indice, { endTime: event.target.value });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      max={480}
                      aria-label={`Pausa del ${nombreDia(indice)} en minutos`}
                      disabled={!dia.activo}
                      value={dia.breakMinutes}
                      onChange={(event) => {
                        actualizarDia(indice, { breakMinutes: event.target.value });
                      }}
                    />
                  </td>
                  <td>
                    {!dia.activo ? '—' : trabajados === null ? '⚠️' : formatearHoras(trabajados)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: '1rem' }}>
        <strong>Total semanal:</strong>{' '}
        <span data-testid="total-semanal">{formatearHoras(totalMinutos)}</span>
      </p>

      <div className="fila">
        <button className="boton" type="submit" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar horario'}
        </button>
        {children}
      </div>
    </form>
  );
}
