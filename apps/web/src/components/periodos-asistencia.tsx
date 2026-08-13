'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { apiFetch, errorMessage } from '@/lib/api';
import { Cargando, Error, Etiqueta, Exito } from '@/components/ui';
import {
  etiquetaPeriodo,
  formatearFechaCalendario,
  formatearFechaHora,
  formatearHoras,
  nombreMes,
  tonoPeriodo,
} from '@/lib/format';
import type { MonthlyPeriod, Relationship } from '@/lib/types';

interface Propiedades {
  relacion: Relationship;
  rol?: 'FAMILY_EMPLOYER' | 'WORKER';
}

export function PeriodosAsistencia({ relacion, rol = 'FAMILY_EMPLOYER' }: Propiedades): ReactNode {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);

  const [periodo, setPeriodo] = useState<MonthlyPeriod | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Modal de confirmación de cierre
  const [mostrarModalCierre, setMostrarModalCierre] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [errorCierre, setErrorCierre] = useState<string | null>(null);

  const cargarPeriodo = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const data = await apiFetch<MonthlyPeriod>(
        `/employment-relationships/${relacion.id}/periods`,
        {
          method: 'POST',
          body: { year: anio, month: mes },
        },
      );
      setPeriodo(data);
    } catch (causa) {
      setError(errorMessage(causa));
    } finally {
      setCargando(false);
    }
  }, [relacion.id, anio, mes]);

  useEffect(() => {
    void cargarPeriodo();
  }, [cargarPeriodo]);

  function cambiarPeriodo(delta: number): void {
    let nuevoMes = mes + delta;
    let nuevoAnio = anio;
    if (nuevoMes < 1) {
      nuevoMes = 12;
      nuevoAnio -= 1;
    } else if (nuevoMes > 12) {
      nuevoMes = 1;
      nuevoAnio += 1;
    }
    setAnio(nuevoAnio);
    setMes(nuevoMes);
  }

  async function confirmarCierre(): Promise<void> {
    if (periodo === null) return;
    setErrorCierre(null);
    setCerrando(true);
    try {
      await apiFetch<MonthlyPeriod>(`/periods/${periodo.id}/close-attendance`, {
        method: 'POST',
        body: { expectedVersion: periodo.version },
      });
      setAviso(`Cerraste la asistencia de ${nombreMes(mes)} ${anio}.`);
      setMostrarModalCierre(false);
      await cargarPeriodo();
    } catch (causa) {
      const msg = errorMessage(causa);
      if (
        msg.includes('RESOURCE_VERSION_CONFLICT') ||
        msg.includes('modificó') ||
        msg.includes('cambió')
      ) {
        setErrorCierre(
          'El período cambió mientras lo estabas revisando. Actualizamos la información para que puedas revisarlo nuevamente.',
        );
      } else {
        setErrorCierre(msg);
      }
      await cargarPeriodo();
    } finally {
      setCerrando(false);
    }
  }

  const mesFinalizado =
    anio < hoy.getFullYear() || (anio === hoy.getFullYear() && mes < hoy.getMonth() + 1);
  const esCerrado =
    periodo?.status === 'READY_FOR_CALCULATION' || periodo?.attendanceApprovedAt !== null;
  const tienePendientes =
    (periodo?.attendance.openDays ?? 0) > 0 ||
    (periodo?.attendance.pendingApprovalDays ?? 0) > 0 ||
    (periodo?.attendance.disputedDays ?? 0) > 0;
  const sinJornadas = (periodo?.attendance.approvedDays ?? 0) === 0;

  return (
    <div className="periodos-asistencia" style={{ marginTop: '1.5rem' }}>
      <div
        className="periodos-cabecera"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1rem',
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>Período mensual de asistencia</h3>
          <p className="suave" style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
            Revisión y cierre de jornadas para preliquidación
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            className="boton boton--secundario"
            onClick={() => cambiarPeriodo(-1)}
            aria-label="Mes anterior"
          >
            ←
          </button>
          <span style={{ fontWeight: 600, minWidth: '130px', textAlign: 'center' }}>
            {nombreMes(mes)} {anio}
          </span>
          <button
            type="button"
            className="boton boton--secundario"
            onClick={() => cambiarPeriodo(1)}
            aria-label="Mes siguiente"
          >
            →
          </button>
        </div>
      </div>

      {aviso && <Exito mensaje={aviso} />}
      {error && <Error mensaje={error} />}

      {cargando && !periodo && <Cargando que="el período mensual" />}

      {periodo && (
        <div className="tarjeta" style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.5rem',
              marginBottom: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                {nombreMes(periodo.month)} {periodo.year}
              </span>
              <Etiqueta
                texto={etiquetaPeriodo(periodo.status)}
                tono={tonoPeriodo(periodo.status)}
              />
            </div>
            <span className="suave" style={{ fontSize: '0.85rem' }}>
              Del {formatearFechaCalendario(periodo.fromDate)} al{' '}
              {formatearFechaCalendario(periodo.toDate)}
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '1rem',
              marginBottom: '1.25rem',
            }}
          >
            <div
              style={{
                background: '#fff',
                padding: '0.85rem',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
              }}
            >
              <div className="suave" style={{ fontSize: '0.8rem' }}>
                Jornadas aprobadas
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a' }}>
                {periodo.attendance.approvedDays}
              </div>
            </div>

            <div
              style={{
                background: '#fff',
                padding: '0.85rem',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
              }}
            >
              <div className="suave" style={{ fontSize: '0.8rem' }}>
                Horas computables
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a' }}>
                {formatearHoras(periodo.attendance.approvedMinutes)}
              </div>
            </div>

            <div
              style={{
                background: '#fff',
                padding: '0.85rem',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
              }}
            >
              <div className="suave" style={{ fontSize: '0.8rem' }}>
                Pendientes / En curso
              </div>
              <div
                style={{
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  color:
                    periodo.attendance.openDays + periodo.attendance.pendingApprovalDays > 0
                      ? '#b45309'
                      : '#0f172a',
                }}
              >
                {periodo.attendance.openDays + periodo.attendance.pendingApprovalDays}
              </div>
            </div>

            <div
              style={{
                background: '#fff',
                padding: '0.85rem',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
              }}
            >
              <div className="suave" style={{ fontSize: '0.8rem' }}>
                En disputa
              </div>
              <div
                style={{
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  color: periodo.attendance.disputedDays > 0 ? '#b91c1c' : '#0f172a',
                }}
              >
                {periodo.attendance.disputedDays}
              </div>
            </div>
          </div>

          {esCerrado && periodo.snapshot && (
            <div
              style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                padding: '1rem',
                borderRadius: '8px',
                marginTop: '0.5rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  color: '#166534',
                  fontWeight: 600,
                }}
              >
                <span>✓ Asistencia cerrada e inmutable</span>
              </div>
              <p style={{ fontSize: '0.9rem', color: '#14532d', margin: '0.5rem 0' }}>
                Las {periodo.snapshot.approvedDays} jornadas (
                {formatearHoras(periodo.snapshot.approvedMinutes)}) fueron congeladas en un snapshot
                inmutable para la liquidación.
              </p>
              <div
                style={{
                  fontSize: '0.75rem',
                  color: '#475569',
                  wordBreak: 'break-all',
                  fontFamily: 'monospace',
                }}
              >
                Huella SHA-256: {periodo.snapshot.hash}
              </div>
              {periodo.attendanceApprovedAt && (
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
                  Cerrado el {formatearFechaHora(periodo.attendanceApprovedAt)}
                </div>
              )}
            </div>
          )}

          {!esCerrado && (
            <div style={{ marginTop: '0.5rem' }}>
              {!mesFinalizado && (
                <div
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    padding: '0.85rem',
                    borderRadius: '8px',
                    color: '#334155',
                    fontSize: '0.9rem',
                    marginBottom: '1rem',
                  }}
                >
                  El período mensual sigue en curso. Podrás cerrar la asistencia cuando finalice el
                  mes.
                </div>
              )}

              {mesFinalizado && tienePendientes && (
                <div
                  style={{
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    padding: '0.85rem',
                    borderRadius: '8px',
                    color: '#92400e',
                    fontSize: '0.9rem',
                    marginBottom: '1rem',
                  }}
                >
                  Para cerrar la asistencia del mes, debés revisar y aprobar todas las jornadas
                  abiertas o pendientes y resolver las correcciones en disputa.
                </div>
              )}

              {mesFinalizado && sinJornadas && !tienePendientes && (
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    padding: '0.85rem',
                    borderRadius: '8px',
                    color: '#475569',
                    fontSize: '0.9rem',
                    marginBottom: '1rem',
                  }}
                >
                  No hay jornadas aprobadas registradas para este mes.
                </div>
              )}

              {rol === 'FAMILY_EMPLOYER' && (
                <button
                  type="button"
                  className="boton"
                  id="boton-cerrar-asistencia-periodo"
                  disabled={!mesFinalizado || tienePendientes || sinJornadas}
                  title={
                    !mesFinalizado
                      ? 'Podrás cerrar la asistencia cuando finalice el período.'
                      : undefined
                  }
                  onClick={() => setMostrarModalCierre(true)}
                  style={{ width: '100%' }}
                >
                  Cerrar asistencia de {nombreMes(periodo.month)}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {mostrarModalCierre && periodo && (
        <div
          className="modal-fondo"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            className="modal-contenido tarjeta"
            style={{ maxWidth: '520px', width: '100%', background: '#fff', padding: '1.5rem' }}
          >
            <h3 style={{ marginTop: 0 }}>
              Cerrar asistencia de {nombreMes(periodo.month)} {periodo.year}
            </h3>

            <p>Estás por cerrar la asistencia mensual de la relación laboral. Esta acción:</p>

            <ul style={{ fontSize: '0.95rem', lineHeight: '1.5' }}>
              <li>
                Congelará <strong>{periodo.attendance.approvedDays} jornadas</strong> con un total
                de <strong>{formatearHoras(periodo.attendance.approvedMinutes)}</strong>.
              </li>
              <li>
                Generará un <strong>snapshot inmutable con huella SHA-256</strong> que será la base
                oficial para calcular la preliquidación de sueldos.
              </li>
              <li>
                No permitirá solicitar ni aprobar nuevas correcciones sobre las jornadas de este
                mes.
              </li>
            </ul>

            {errorCierre && <Error mensaje={errorCierre} />}

            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                justifyContent: 'flex-end',
                marginTop: '1.5rem',
              }}
            >
              <button
                type="button"
                className="boton boton--secundario"
                disabled={cerrando}
                onClick={() => setMostrarModalCierre(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="boton"
                id="boton-confirmar-cierre-periodo"
                disabled={cerrando}
                onClick={() => void confirmarCierre()}
              >
                {cerrando ? 'Cerrando asistencia…' : 'Confirmar y cerrar asistencia'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
