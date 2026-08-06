'use client';

import type { ReactNode } from 'react';
import { AvisoDatosDePrueba, Etiqueta } from '@/components/ui';
import {
  ETIQUETAS_ESQUEMA,
  ETIQUETAS_MODALIDAD,
  etiquetaRelacion,
  formatearFecha,
  formatearHoras,
  formatearImporte,
  nombreDia,
} from '@/lib/format';
import type { Relationship, RelationshipStatus } from '@/lib/types';

export function tonoRelacion(status: RelationshipStatus): 'activa' | 'espera' | 'cerrada' {
  if (status === 'ACTIVE') return 'activa';
  if (status === 'TERMINATED' || status === 'SUSPENDED') return 'cerrada';
  return 'espera';
}

/**
 * Resumen de lo acordado.
 *
 * Es la misma vista para la familia y para la trabajadora: las dos partes tienen
 * que ver exactamente lo mismo, porque es sobre esto que una acepta y la otra
 * queda obligada.
 */
export function ResumenRelacion({ relacion }: { relacion: Relationship }): ReactNode {
  const { conditions, schedule } = relacion;

  return (
    <div className="pila">
      <div className="tarjeta">
        <div className="entre">
          <div>
            <h2>Relación laboral</h2>
            <p className="suave">
              {relacion.household.label} — {relacion.household.city}
            </p>
          </div>
          <Etiqueta
            texto={etiquetaRelacion(relacion.status)}
            tono={tonoRelacion(relacion.status)}
          />
        </div>

        <dl className="datos">
          <div>
            <dt>Familia empleadora</dt>
            <dd>{relacion.employer.name}</dd>
          </div>
          <div>
            <dt>Trabajadora</dt>
            <dd>{relacion.worker?.name ?? 'Sin confirmar'}</dd>
          </div>
        </dl>

        <p>
          <strong>Siguiente paso:</strong> {relacion.nextAction.description}
        </p>
      </div>

      <div className="tarjeta">
        <h2>Condiciones acordadas</h2>

        {conditions === null ? (
          <p className="suave">Todavía no se cargaron las condiciones.</p>
        ) : (
          <>
            <AvisoDatosDePrueba />
            <dl className="datos">
              <div>
                <dt>Fecha prevista de inicio</dt>
                <dd>{formatearFecha(conditions.plannedStartDate)}</dd>
              </div>
              <div>
                <dt>Categoría</dt>
                <dd>{conditions.categoryCode}</dd>
              </div>
              <div>
                <dt>Modalidad</dt>
                <dd>{ETIQUETAS_MODALIDAD[conditions.liveInMode] ?? conditions.liveInMode}</dd>
              </div>
              <div>
                <dt>Forma de la remuneración</dt>
                <dd>
                  {ETIQUETAS_ESQUEMA[conditions.remunerationScheme] ??
                    conditions.remunerationScheme}
                </dd>
              </div>
              <div>
                <dt>Remuneración acordada</dt>
                <dd data-testid="remuneracion">
                  {formatearImporte(conditions.agreedRemuneration, conditions.currency)}
                </dd>
              </div>
              <div>
                <dt>Horas semanales estimadas</dt>
                <dd>{conditions.weeklyHours ?? '—'}</dd>
              </div>
              <div>
                <dt>Día de pago habitual</dt>
                <dd>{conditions.paymentDayOfMonth ?? 'A convenir'}</dd>
              </div>
              <div>
                <dt>Revisión profesional</dt>
                <dd>{conditions.requiresProfessionalReview ? 'Solicitada' : 'No solicitada'}</dd>
              </div>
              {conditions.acceptedByWorkerAt !== null && (
                <div>
                  <dt>Aceptadas por la trabajadora</dt>
                  <dd>{formatearFecha(conditions.acceptedByWorkerAt)}</dd>
                </div>
              )}
            </dl>
          </>
        )}
      </div>

      <div className="tarjeta">
        <h2>Horario semanal</h2>

        {schedule === null || schedule.days.length === 0 ? (
          <p className="suave">Todavía no se cargó el horario.</p>
        ) : (
          <>
            <div className="tabla-envoltorio">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Día</th>
                    <th scope="col">Entrada</th>
                    <th scope="col">Salida</th>
                    <th scope="col">Pausa</th>
                  </tr>
                </thead>
                <tbody>
                  {[...schedule.days]
                    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                    .map((dia) => (
                      <tr key={dia.dayOfWeek}>
                        <th scope="row" style={{ textTransform: 'capitalize' }}>
                          {nombreDia(dia.dayOfWeek)}
                        </th>
                        <td>{dia.startTime}</td>
                        <td>{dia.endTime}</td>
                        <td>{dia.breakMinutes} min</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: '1rem' }}>
              <strong>Total semanal:</strong>{' '}
              <span data-testid="total-semanal">{formatearHoras(schedule.weeklyMinutes)}</span>
            </p>
            <p className="campo__ayuda">
              Los horarios son hora local de {relacion.household.timezone}.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
