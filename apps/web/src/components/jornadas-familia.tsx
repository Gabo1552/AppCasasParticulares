'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { apiFetch, errorMessage } from '@/lib/api';
import { Campo, Cargando, Error, Etiqueta, Exito } from '@/components/ui';
import {
  etiquetaAsistencia,
  formatearFechaCalendario,
  formatearHoras,
  tonoAsistencia,
} from '@/lib/format';
import type { AttendanceRecord, Relationship } from '@/lib/types';

interface Propiedades {
  relacion: Relationship;
}

export function JornadasFamilia({ relacion }: Propiedades): ReactNode {
  const [jornadas, setJornadas] = useState<AttendanceRecord[] | null>(null);
  const [jornadaSeleccionada, setJornadaSeleccionada] = useState<AttendanceRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  // Rechazo de corrección
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [rechazandoId, setRechazandoId] = useState<string | null>(null);

  // Proponer corrección administrativa por la familia
  const [proponiendo, setProponiendo] = useState(false);
  const [horaEntradaPropuesta, setHoraEntradaPropuesta] = useState('08:00');
  const [horaSalidaPropuesta, setHoraSalidaPropuesta] = useState('16:00');
  const [motivoPropuesta, setMotivoPropuesta] = useState('');

  const cargarJornadas = useCallback(async () => {
    try {
      const data = await apiFetch<AttendanceRecord[]>(
        `/employment-relationships/${relacion.id}/attendance?limit=30`,
      );
      setJornadas(data);
      if (jornadaSeleccionada) {
        const actualizada = data.find((j) => j.id === jornadaSeleccionada.id);
        if (actualizada) setJornadaSeleccionada(actualizada);
      }
    } catch (causa) {
      setError(errorMessage(causa));
    }
  }, [relacion.id, jornadaSeleccionada]);

  useEffect(() => {
    void cargarJornadas();
  }, [cargarJornadas]);

  function formatearHoraCorta(iso: string | null): string {
    if (!iso) return '--:--';
    try {
      return new Date(iso).toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: relacion.household.timezone || 'America/Argentina/Buenos_Aires',
      });
    } catch {
      return iso.slice(11, 16);
    }
  }

  async function aprobarJornada(jornada: AttendanceRecord): Promise<void> {
    setError(null);
    setAviso(null);
    setProcesando(true);
    try {
      await apiFetch(`/attendance/${jornada.id}/approve`, {
        method: 'POST',
        body: { expectedVersion: jornada.version },
      });
      setAviso('Aprobaste la jornada de trabajo.');
      await cargarJornadas();
    } catch (causa) {
      const msg = errorMessage(causa);
      if (
        msg.includes('RESOURCE_VERSION_CONFLICT') ||
        msg.includes('modificada') ||
        msg.includes('cambió')
      ) {
        setError(
          'La jornada cambió mientras la estabas revisando. Actualizamos la información para que puedas revisarla nuevamente.',
        );
      } else {
        setError(msg);
      }
      await cargarJornadas();
    } finally {
      setProcesando(false);
    }
  }

  async function aprobarCorreccion(jornada: AttendanceRecord, correctionId: string): Promise<void> {
    setError(null);
    setAviso(null);
    setProcesando(true);
    try {
      await apiFetch(`/attendance/${jornada.id}/corrections/${correctionId}/approve`, {
        method: 'POST',
        body: { expectedVersion: jornada.version },
      });
      setAviso(
        'Aprobaste la corrección solicitada. La jornada quedó aprobada con el nuevo horario.',
      );
      await cargarJornadas();
    } catch (causa) {
      const msg = errorMessage(causa);
      if (
        msg.includes('RESOURCE_VERSION_CONFLICT') ||
        msg.includes('modificada') ||
        msg.includes('cambió')
      ) {
        setError(
          'La jornada cambió mientras la estabas revisando. Actualizamos la información para que puedas revisarla nuevamente.',
        );
      } else {
        setError(msg);
      }
      await cargarJornadas();
    } finally {
      setProcesando(false);
    }
  }

  async function rechazarCorreccion(
    jornada: AttendanceRecord,
    correctionId: string,
  ): Promise<void> {
    setError(null);
    setAviso(null);
    setProcesando(true);
    try {
      await apiFetch(`/attendance/${jornada.id}/corrections/${correctionId}/reject`, {
        method: 'POST',
        body: {
          reason: motivoRechazo.trim(),
          expectedVersion: jornada.version,
        },
      });
      setAviso('Rechazaste la solicitud de corrección.');
      setRechazandoId(null);
      setMotivoRechazo('');
      await cargarJornadas();
    } catch (causa) {
      const msg = errorMessage(causa);
      if (
        msg.includes('RESOURCE_VERSION_CONFLICT') ||
        msg.includes('modificada') ||
        msg.includes('cambió')
      ) {
        setError(
          'La jornada cambió mientras la estabas revisando. Actualizamos la información para que puedas revisarla nuevamente.',
        );
      } else {
        setError(msg);
      }
      await cargarJornadas();
    } finally {
      setProcesando(false);
    }
  }

  async function proponerCorreccion(jornada: AttendanceRecord): Promise<void> {
    setError(null);
    setAviso(null);
    setProcesando(true);

    const baseDate = jornada.date;
    const proposedClockInAt = `${baseDate}T${horaEntradaPropuesta}:00.000Z`;
    const proposedClockOutAt = `${baseDate}T${horaSalidaPropuesta}:00.000Z`;

    try {
      await apiFetch(`/attendance/${jornada.id}/corrections`, {
        method: 'POST',
        body: {
          proposedClockInAt,
          proposedClockOutAt,
          reason: motivoPropuesta.trim(),
          expectedVersion: jornada.version,
        },
      });
      setAviso('Propuesta de corrección registrada.');
      setProponiendo(false);
      setMotivoPropuesta('');
      await cargarJornadas();
    } catch (causa) {
      setError(errorMessage(causa));
      await cargarJornadas();
    } finally {
      setProcesando(false);
    }
  }

  if (jornadas === null) {
    return <Cargando que="las jornadas de trabajo" />;
  }

  return (
    <div className="pila">
      <Error mensaje={error} />
      <Exito mensaje={aviso} />

      {/* Detalle de jornada seleccionada */}
      {jornadaSeleccionada && (
        <section className="tarjeta" style={{ border: '2px solid var(--color-primario, #1864ab)' }}>
          <div className="entre">
            <div>
              <h3>Jornada del {formatearFechaCalendario(jornadaSeleccionada.date)}</h3>
              <p className="suave">{relacion.worker?.name ?? 'Trabajadora'}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Etiqueta
                texto={etiquetaAsistencia(jornadaSeleccionada.status)}
                tono={tonoAsistencia(jornadaSeleccionada.status)}
              />
              <button
                type="button"
                className="boton boton--secundario"
                onClick={() => setJornadaSeleccionada(null)}
              >
                Cerrar detalle
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '1rem',
              marginTop: '1rem',
              backgroundColor: 'var(--color-fondo-suave, #f8f9fa)',
              padding: '1rem',
              borderRadius: 'var(--radio, 8px)',
            }}
          >
            <div>
              <span className="suave" style={{ fontSize: '0.85rem' }}>
                Entrada
              </span>
              <p style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>
                {formatearHoraCorta(
                  jornadaSeleccionada.effectiveClockInAt ?? jornadaSeleccionada.clockInAt,
                )}
              </p>
            </div>
            <div>
              <span className="suave" style={{ fontSize: '0.85rem' }}>
                Salida
              </span>
              <p style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>
                {formatearHoraCorta(
                  jornadaSeleccionada.effectiveClockOutAt ?? jornadaSeleccionada.clockOutAt,
                )}
              </p>
            </div>
            <div>
              <span className="suave" style={{ fontSize: '0.85rem' }}>
                Duración
              </span>
              <p style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>
                {formatearHoras(
                  jornadaSeleccionada.approvedMinutes ?? jornadaSeleccionada.computableMinutes,
                )}
              </p>
            </div>
          </div>

          {/* Correcciones pendientes */}
          {jornadaSeleccionada.corrections
            .filter((c) => c.status === 'PENDING')
            .map((corr) => (
              <div
                key={corr.id}
                className="tarjeta"
                style={{ marginTop: '1rem', borderLeft: '4px solid #f59f00' }}
              >
                <h4>Solicitud de corrección pendiente</h4>
                <p>
                  <strong>Motivo declarado:</strong> {corr.reason}
                </p>
                <p className="suave">
                  Horario propuesto: {formatearHoraCorta(corr.proposedClockInAt)} a{' '}
                  {formatearHoraCorta(corr.proposedClockOutAt)}
                </p>

                {rechazandoId !== corr.id ? (
                  <div className="fila" style={{ marginTop: '0.75rem' }}>
                    <button
                      type="button"
                      className="boton boton--primario"
                      disabled={procesando}
                      onClick={() => void aprobarCorreccion(jornadaSeleccionada, corr.id)}
                    >
                      {procesando ? 'Aprobando…' : '✓ Aprobar corrección'}
                    </button>
                    <button
                      type="button"
                      className="boton boton--peligro"
                      disabled={procesando}
                      onClick={() => setRechazandoId(corr.id)}
                    >
                      Rechazar
                    </button>
                  </div>
                ) : (
                  <div className="pila" style={{ marginTop: '0.75rem' }}>
                    <Campo etiqueta="Motivo del rechazo (opcional)">
                      {(id) => (
                        <textarea
                          id={id}
                          rows={2}
                          value={motivoRechazo}
                          onChange={(e) => setMotivoRechazo(e.target.value)}
                          placeholder="Contá por qué no corresponde…"
                        />
                      )}
                    </Campo>
                    <div className="fila">
                      <button
                        type="button"
                        className="boton boton--peligro"
                        disabled={procesando}
                        onClick={() => void rechazarCorreccion(jornadaSeleccionada, corr.id)}
                      >
                        Confirmar rechazo
                      </button>
                      <button
                        type="button"
                        className="boton boton--secundario"
                        onClick={() => setRechazandoId(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

          {/* Acciones principales de la jornada */}
          <div className="fila" style={{ marginTop: '1.25rem' }}>
            {jornadaSeleccionada.status === 'PENDING_APPROVAL' && (
              <button
                type="button"
                className="boton boton--primario"
                disabled={procesando}
                onClick={() => void aprobarJornada(jornadaSeleccionada)}
              >
                {procesando ? 'Aprobando…' : '✓ Aprobar jornada'}
              </button>
            )}

            {!proponiendo && jornadaSeleccionada.status !== 'APPROVED' && (
              <button
                type="button"
                className="boton boton--secundario"
                onClick={() => {
                  setProponiendo(true);
                  setHoraEntradaPropuesta(formatearHoraCorta(jornadaSeleccionada.clockInAt));
                  setHoraSalidaPropuesta(formatearHoraCorta(jornadaSeleccionada.clockOutAt));
                }}
              >
                Proponer corrección
              </button>
            )}
          </div>

          {/* Formulario de propuesta de corrección por la familia */}
          {proponiendo && (
            <div className="tarjeta" style={{ marginTop: '1rem' }}>
              <h4>Proponer corrección administrativa</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <Campo etiqueta="Hora de entrada (HH:MM)">
                  {(id) => (
                    <input
                      id={id}
                      type="time"
                      value={horaEntradaPropuesta}
                      onChange={(e) => setHoraEntradaPropuesta(e.target.value)}
                    />
                  )}
                </Campo>
                <Campo etiqueta="Hora de salida (HH:MM)">
                  {(id) => (
                    <input
                      id={id}
                      type="time"
                      value={horaSalidaPropuesta}
                      onChange={(e) => setHoraSalidaPropuesta(e.target.value)}
                    />
                  )}
                </Campo>
              </div>
              <Campo etiqueta="Motivo de la corrección">
                {(id) => (
                  <textarea
                    id={id}
                    rows={2}
                    value={motivoPropuesta}
                    onChange={(e) => setMotivoPropuesta(e.target.value)}
                    placeholder="Motivo del ajuste…"
                  />
                )}
              </Campo>
              <div className="fila">
                <button
                  type="button"
                  className="boton boton--primario"
                  disabled={procesando || motivoPropuesta.trim().length < 3}
                  onClick={() => void proponerCorreccion(jornadaSeleccionada)}
                >
                  Guardar corrección
                </button>
                <button
                  type="button"
                  className="boton boton--secundario"
                  onClick={() => setProponiendo(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Lista de jornadas */}
      <section className="tarjeta">
        <div className="entre">
          <h2>Jornadas registradas</h2>
          <span className="suave">{jornadas.length} jornadas</span>
        </div>

        {jornadas.length === 0 ? (
          <p className="suave" style={{ marginTop: '1rem' }}>
            Todavía no hay jornadas de asistencia registradas para esta trabajadora.
          </p>
        ) : (
          <div className="pila" style={{ marginTop: '1rem' }}>
            {jornadas.map((j) => (
              <article
                key={j.id}
                style={{
                  padding: '0.75rem',
                  borderBottom: '1px solid var(--color-borde, #dee2e6)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div>
                  <strong>{formatearFechaCalendario(j.date)}</strong>
                  <p className="suave" style={{ margin: 0, fontSize: '0.9rem' }}>
                    Entrada: {formatearHoraCorta(j.effectiveClockInAt ?? j.clockInAt)} | Salida:{' '}
                    {formatearHoraCorta(j.effectiveClockOutAt ?? j.clockOutAt)}
                    {j.approvedMinutes !== null
                      ? ` • ${formatearHoras(j.approvedMinutes)} aprobadas`
                      : j.computableMinutes > 0
                        ? ` • ${formatearHoras(j.computableMinutes)} calculadas`
                        : ''}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Etiqueta texto={etiquetaAsistencia(j.status)} tono={tonoAsistencia(j.status)} />
                  <button
                    type="button"
                    className="boton boton--secundario"
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                    onClick={() => setJornadaSeleccionada(j)}
                  >
                    Ver detalle
                  </button>
                  {j.status === 'PENDING_APPROVAL' && (
                    <button
                      type="button"
                      className="boton boton--primario"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                      disabled={procesando}
                      onClick={() => void aprobarJornada(j)}
                    >
                      Aprobar
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
