/**
 * Política temporal de cierre de períodos mensuales de asistencia.
 *
 * Un período mensual (año, mes) sólo puede cerrarse cuando el mes ha
 * finalizado completamente según la zona horaria del domicilio de la relación.
 *
 * La regla exige: fecha local actual > última fecha del período mensual.
 */

export function getLocalYearMonthDay(
  date: Date,
  timezone: string = 'America/Argentina/Buenos_Aires',
): { year: number; month: number; day: number } {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const year = Number(parts.find((p) => p.type === 'year')?.value);
    const month = Number(parts.find((p) => p.type === 'month')?.value);
    const day = Number(parts.find((p) => p.type === 'day')?.value);
    return { year, month, day };
  } catch {
    // Fallback defensivo ante timezone inválido
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const year = Number(parts.find((p) => p.type === 'year')?.value);
    const month = Number(parts.find((p) => p.type === 'month')?.value);
    const day = Number(parts.find((p) => p.type === 'day')?.value);
    return { year, month, day };
  }
}

/**
 * Evalúa si un período mensual de asistencia ya finalizó y puede cerrarse.
 *
 * @param periodYear Año del período
 * @param periodMonth Mes del período (1..12)
 * @param timezone Zona horaria IANA del domicilio (ej: 'America/Argentina/Buenos_Aires')
 * @param now Fecha/hora de referencia (por defecto, reloj actual)
 */
export function canCloseMonthlyAttendancePeriod(
  periodYear: number,
  periodMonth: number,
  timezone: string = 'America/Argentina/Buenos_Aires',
  now: Date = new Date(),
): boolean {
  const local = getLocalYearMonthDay(now, timezone);

  // Si el año actual es posterior al año del período, el mes ya concluyó
  if (local.year > periodYear) {
    return true;
  }

  // Si es el mismo año, el mes actual debe ser estrictamente posterior al mes del período
  if (local.year === periodYear && local.month > periodMonth) {
    return true;
  }

  // Mes en curso o meses futuros no han finalizado
  return false;
}
