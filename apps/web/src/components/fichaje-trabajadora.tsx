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

export function FichajeTrabajadora({ relacion }: Propiedades): ReactNode {
  const [jornadas, setJornadas] = useState<AttendanceRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  // Formulario de corrección
  const [corrigiendoJornada, setCorrigiendoJornada] = useState<AttendanceRecord | null>(null);
  const [horaEntradaPropuesta, setHoraEntradaPropuesta] = useState('08:00');
  const [horaSalidaPropuesta, setHoraSalidaPropuesta] = useState('16:00');
  const [motivoCorreccion, setMotivoCorreccion] = useState('');

  const cargarJornadas = useCallback(async () => {
    try {
      const data = await apiFetch<AttendanceRecord[]>(
        `/employment-relationships/${relacion.id}/attendance?limit=15`,
      );
      setJornadas(data);
    } catch (causa) {
      setError(errorMessage(causa));
    }
  }, [relacion.id]);

  useEffect(() => {
    void cargarJornadas();
  }, [cargarJornadas]);

  // La fecha de la jornada la fija el servidor en la zona horaria del
  // domicilio, así que "hoy" hay que calcularlo con la misma zona. Con
  // toISOString() —es decir, UTC— entre las 21:00 y la medianoche de Buenos
  // Aires el navegador ya estaba en el día siguiente y la jornada en curso
  // dejaba de encontrarse.
  const hoyLocal = new Date().toLocaleDateString('en-CA', {
    timeZone: relacion.household.timezone,
  });
  const jornadaHoy = jornadas?.find((j) => j.date === hoyLocal) ?? jornadas?.[0];
  const jornadaAbierta = jornadas?.find((j) => j.status === 'OPEN');

  const jornadaActual = jornadaAbierta ?? (jornadaHoy?.date === hoyLocal ? jornadaHoy : null);

  async function ficharEntrada(): Promise<void> {
    setError(null);
    setAviso(null);
    setProcesando(true);
    try {
      await apiFetch(`/employment-relationships/${relacion.id}/attendance/clock-in`, {
        method: 'POST',
        body: { method: 'BUTTON' },
      });
      setAviso('¡Fichaste la entrada correctamente!');
      await cargarJornadas();
    } catch (causa) {
      setError(errorMessage(causa));
    } finally {
      setProcesando(false);
    }
  }

  async function ficharSalida(): Promise<void> {
    if (!jornadaActual) return;
    setError(null);
    setAviso(null);
    setProcesando(true);
    try {
      await apiFetch(`/attendance/${jornadaActual.id}/clock-out`, {
        method: 'POST',
        body: {},
      });
      setAviso(
        '¡Fichaste la salida correctamente! La jornada quedó pendiente de revisión por la familia.',
      );
      await cargarJornadas();
    } catch (causa) {
      setError(errorMessage(causa));
    } finally {
      setProcesando(false);
    }
  }

  async function enviarCorreccion(): Promise<void> {
    if (!corrigiendoJornada) return;
    setError(null);
    setAviso(null);
    setProcesando(true);

    const baseDate = corrigiendoJornada.date;
    const proposedClockInAt = `${baseDate}T${horaEntradaPropuesta}:00.000Z`;
    const proposedClockOutAt = `${baseDate}T${horaSalidaPropuesta}:00.000Z`;

    try {
      await apiFetch(`/attendance/${corrigiendoJornada.id}/corrections`, {
        method: 'POST',
        body: {
          proposedClockInAt,
          proposedClockOutAt,
          reason: motivoCorreccion.trim(),
          expectedVersion: corrigiendoJornada.version,
        },
      });
      setAviso('Solicitud de corrección enviada. La familia va a revisarla.');
      setCorrigiendoJornada(null);
      setMotivoCorreccion('');
      await cargarJornadas();
    } catch (causa) {
      setError(errorMessage(causa));
      await cargarJornadas();
    } finally {
      setProcesando(false);
    }
  }

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

  if (jornadas === null) {
    return <Cargando que="las jornadas de trabajo" />;
  }

  return (
    <div className="pila">
      <Error mensaje={error} />
      <Exito mensaje={aviso} />

      {/* Widget principal de Fichaje del día */}
      <section className="tarjeta">
        <div className="entre">
          <div>
            <h2>Asistencia de hoy</h2>
            <p className="suave">
              {formatearFechaCalendario(hoyLocal)} — {relacion.household.label}
            </p>
          </div>
          {jornadaActual && (
            <Etiqueta
              texto={etiquetaAsistencia(jornadaActual.status)}
              tono={tonoAsistencia(jornadaActual.status)}
            />
          )}
        </div>

        <div style={{ marginTop: '1.25rem' }}>
          {/* Caso 1: Sin fichaje hoy */}
          {!jornadaActual && (
            <div className="pila">
              <p>Todavía no registraste la entrada para la jornada de hoy.</p>
              <button
                type="button"
                className="boton boton--primario"
                style={{ fontSize: '1.1rem', padding: '0.75rem 1.5rem' }}
                disabled={procesando}
                onClick={() => void ficharEntrada()}
              >
                {procesando ? 'Registrando…' : '📍 Fichar entrada'}
              </button>
            </div>
          )}

          {/* Caso 2: Jornada abierta (ingresó, falta salida) */}
          {jornadaActual && jornadaActual.status === 'OPEN' && (
            <div className="pila">
              <div
                className="tarjeta"
                style={{ backgroundColor: 'var(--color-fondo-suave, #f8f9fa)' }}
              >
                <p>
                  <strong>Hora de entrada registrada:</strong>{' '}
                  <span style={{ fontSize: '1.2rem', fontWeight: 600 }}>
                    {formatearHoraCorta(jornadaActual.clockInAt)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                className="boton"
                style={{ fontSize: '1.1rem', padding: '0.75rem 1.5rem' }}
                disabled={procesando}
                onClick={() => void ficharSalida()}
              >
                {procesando ? 'Registrando…' : '🏁 Fichar salida'}
              </button>
            </div>
          )}

          {/* Caso 3: Jornada cerrada (pendiente de aprobación o aprobada) */}
          {jornadaActual && jornadaActual.status !== 'OPEN' && (
            <div className="pila">
              <div
                className="tarjeta"
                style={{ backgroundColor: 'var(--color-fondo-suave, #f8f9fa)' }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: '1rem',
                  }}
                >
                  <div>
                    <span className="suave" style={{ fontSize: '0.85rem' }}>
                      Entrada
                    </span>
                    <p style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>
                      {formatearHoraCorta(
                        jornadaActual.effectiveClockInAt ?? jornadaActual.clockInAt,
                      )}
                    </p>
                  </div>
                  <div>
                    <span className="suave" style={{ fontSize: '0.85rem' }}>
                      Salida
                    </span>
                    <p style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>
                      {formatearHoraCorta(
                        jornadaActual.effectiveClockOutAt ?? jornadaActual.clockOutAt,
                      )}
                    </p>
                  </div>
                  <div>
                    <span className="suave" style={{ fontSize: '0.85rem' }}>
                      {jornadaActual.status === 'APPROVED'
                        ? 'Tiempo aprobado'
                        : 'Tiempo registrado'}
                    </span>
                    <p style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>
                      {formatearHoras(
                        jornadaActual.approvedMinutes ?? jornadaActual.computableMinutes,
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {jornadaActual.status === 'PENDING_APPROVAL' && (
                <div className="fila">
                  <p className="suave" style={{ margin: 0 }}>
                    La jornada está pendiente de revisión por la familia.
                  </p>
                  <button
                    type="button"
                    className="boton boton--secundario"
                    onClick={() => {
                      setCorrigiendoJornada(jornadaActual);
                      setHoraEntradaPropuesta(formatearHoraCorta(jornadaActual.clockInAt));
                      setHoraSalidaPropuesta(formatearHoraCorta(jornadaActual.clockOutAt));
                    }}
                  >
                    Solicitar corrección
                  </button>
                </div>
              )}

              {jornadaActual.status === 'APPROVED' && (
                <div className="fila">
                  <p style={{ color: 'var(--color-exito, #2b8a3e)', fontWeight: 500, margin: 0 }}>
                    ✓ Jornada aprobada por la familia empleadora (
                    {formatearHoras(jornadaActual.approvedMinutes ?? 0)}).
                  </p>
                </div>
              )}

              {jornadaActual.status === 'DISPUTED' && (
                <p className="suave">
                  Tenés una solicitud de corrección en revisión para esta jornada.
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Modal / Sección de solicitud de corrección */}
      {corrigiendoJornada && (
        <section className="tarjeta" style={{ border: '2px solid var(--color-primario, #1864ab)' }}>
          <div className="entre">
            <h3>
              Solicitar corrección de jornada — {formatearFechaCalendario(corrigiendoJornada.date)}
            </h3>
            <button
              type="button"
              className="boton boton--secundario"
              onClick={() => setCorrigiendoJornada(null)}
            >
              Cerrar
            </button>
          </div>

          <p className="suave">
            Si te olvidaste de fichar o hubo una diferencia en el horario real trabajado, indicá las
            horas correctas y el motivo. La familia empleadora va a poder revisarlo y aprobarlo.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Campo etiqueta="Hora de entrada real (HH:MM)">
              {(id) => (
                <input
                  id={id}
                  type="time"
                  value={horaEntradaPropuesta}
                  onChange={(e) => setHoraEntradaPropuesta(e.target.value)}
                />
              )}
            </Campo>
            <Campo etiqueta="Hora de salida real (HH:MM)">
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

          <Campo
            etiqueta="Motivo de la corrección"
            ayuda="Ejemplo: 'Me olvidé de fichar la salida a las 17:00'."
          >
            {(id) => (
              <textarea
                id={id}
                rows={3}
                maxLength={500}
                value={motivoCorreccion}
                onChange={(e) => setMotivoCorreccion(e.target.value)}
                placeholder="Contá brevemente qué ocurrió…"
              />
            )}
          </Campo>

          <div className="fila">
            <button
              type="button"
              className="boton boton--primario"
              disabled={procesando || motivoCorreccion.trim().length < 3}
              onClick={() => void enviarCorreccion()}
            >
              {procesando ? 'Enviando…' : 'Enviar solicitud de corrección'}
            </button>
            <button
              type="button"
              className="boton boton--secundario"
              disabled={procesando}
              onClick={() => setCorrigiendoJornada(null)}
            >
              Cancelar
            </button>
          </div>
        </section>
      )}

      {/* Historial de jornadas anteriores */}
      <section className="tarjeta">
        <h3>Historial de jornadas</h3>

        {jornadas.length === 0 ? (
          <p className="suave">Todavía no hay jornadas registradas para esta relación laboral.</p>
        ) : (
          <div className="pila">
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
                      ? ` (${formatearHoras(j.approvedMinutes)})`
                      : j.computableMinutes > 0
                        ? ` (${formatearHoras(j.computableMinutes)})`
                        : ''}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Etiqueta texto={etiquetaAsistencia(j.status)} tono={tonoAsistencia(j.status)} />
                  {j.status === 'PENDING_APPROVAL' && !corrigiendoJornada && (
                    <button
                      type="button"
                      className="boton boton--secundario"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                      onClick={() => {
                        setCorrigiendoJornada(j);
                        setHoraEntradaPropuesta(formatearHoraCorta(j.clockInAt));
                        setHoraSalidaPropuesta(formatearHoraCorta(j.clockOutAt));
                      }}
                    >
                      Corregir
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
