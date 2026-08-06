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

export function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
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
