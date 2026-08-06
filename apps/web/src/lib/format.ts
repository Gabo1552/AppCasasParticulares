import type { RelationshipStatus, InvitationStatus } from './types';

/**
 * Formato local.
 *
 * Todo en es-AR: el idioma decide el orden de la fecha y el separador decimal, y
 * mostrar "9/1/2026" a alguien que escribe "1/9/2026" no es un detalle estético.
 */

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function nombreDia(dayOfWeek: number): string {
  return DIAS[dayOfWeek] ?? '';
}

/**
 * Fecha de un instante (cuándo pasó algo), en la zona horaria del navegador.
 *
 * Para fechas de calendario usar `formatearFechaCalendario`, no esta.
 */
export function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Fecha de calendario: la fecha *es* el dato, no el instante en que ocurrió.
 *
 * La fecha de inicio de una relación laboral es el 1 de septiembre, punto — no
 * un momento en el tiempo que cambie según dónde esté quien mira. La API la
 * manda como medianoche UTC, y pasarla por `new Date()` en Argentina (GMT-3) la
 * corre al 31 de agosto. Sobre una fecha de inicio de una relación laboral, un
 * día de diferencia no es un detalle de formato.
 *
 * Por eso se parte el `YYYY-MM-DD` a mano en vez de construir un `Date`: sin
 * `Date` no hay conversión de zona que pueda correr el día.
 */
export function formatearFechaCalendario(iso: string): string {
  const [anio, mes, dia] = iso.slice(0, 10).split('-');
  if (anio === undefined || mes === undefined || dia === undefined) return iso;
  return `${dia}/${mes}/${anio}`;
}

export function formatearFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Importe para mostrar.
 *
 * Recibe el string decimal que devuelve la API y lo convierte a number **sólo
 * acá**, en el último paso antes de pintarlo. El valor que se guarda, se compara
 * o se reenvía sigue siendo siempre el string (RN-13).
 */
export function formatearImporte(decimal: string, moneda = 'ARS'): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: moneda,
    minimumFractionDigits: 2,
  }).format(Number(decimal));
}

export function formatearHoras(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (resto === 0) return `${horas} h`;
  return `${horas} h ${resto} min`;
}

const ETIQUETAS_RELACION: Record<RelationshipStatus, string> = {
  DRAFT: 'Borrador',
  PENDING_CONFIGURATION: 'Falta configurar',
  PENDING_WORKER_ACCEPTANCE: 'Esperando aceptación',
  ACTIVE: 'Activa',
  SUSPENDED: 'Suspendida',
  TERMINATION_IN_PROGRESS: 'Baja en curso',
  TERMINATED: 'Finalizada',
};

export function etiquetaRelacion(status: RelationshipStatus): string {
  return ETIQUETAS_RELACION[status] ?? status;
}

const ETIQUETAS_INVITACION: Record<InvitationStatus, string> = {
  PENDING: 'Pendiente',
  ACCEPTED: 'Aceptada',
  REJECTED: 'Rechazada',
  REVOKED: 'Dada de baja',
  EXPIRED: 'Vencida',
};

export function etiquetaInvitacion(status: InvitationStatus): string {
  return ETIQUETAS_INVITACION[status] ?? status;
}

export const ETIQUETAS_MODALIDAD: Record<string, string> = {
  WITH_WITHDRAWAL: 'Con retiro (se retira al terminar la jornada)',
  WITHOUT_WITHDRAWAL: 'Sin retiro (reside en el domicilio)',
};

export const ETIQUETAS_ESQUEMA: Record<string, string> = {
  MONTHLY: 'Mensual',
  HOURLY: 'Por hora',
};
