import { describe, expect, it } from 'vitest';
import { canCloseMonthlyAttendancePeriod, getLocalYearMonthDay } from '../payroll-period-policy';

describe('PayrollPeriodPolicy (temporal close invariants)', () => {
  const tzBA = 'America/Argentina/Buenos_Aires';

  describe('canCloseMonthlyAttendancePeriod', () => {
    it('permite cerrar un mes pasado dentro del mismo año', () => {
      // Período: Mayo 2026 (mes 5). Fecha actual: 15 de Agosto 2026 (mes 8).
      const now = new Date('2026-08-15T12:00:00.000Z');
      expect(canCloseMonthlyAttendancePeriod(2026, 5, tzBA, now)).toBe(true);
    });

    it('permite cerrar un mes pasado de un año anterior', () => {
      // Período: Noviembre 2025. Fecha actual: 10 de Febrero 2026.
      const now = new Date('2026-02-10T12:00:00.000Z');
      expect(canCloseMonthlyAttendancePeriod(2025, 11, tzBA, now)).toBe(true);
    });

    it('rechaza cerrar el mes en curso', () => {
      // Período: Agosto 2026 (mes 8). Fecha actual: 13 de Agosto 2026 (mes 8).
      const now = new Date('2026-08-13T12:00:00.000Z');
      expect(canCloseMonthlyAttendancePeriod(2026, 8, tzBA, now)).toBe(false);
    });

    it('rechaza cerrar el mes en curso incluso el último día del mes antes de medianoche local', () => {
      // Período: Agosto 2026 (mes 8). Fecha actual: 31 de Agosto 2026 a las 23:59:59 en BA (02:59:59 UTC del 1 de Sep).
      const now = new Date('2026-09-01T02:59:59.000Z');
      expect(canCloseMonthlyAttendancePeriod(2026, 8, tzBA, now)).toBe(false);
    });

    it('permite cerrar el mes inmediatamente al comenzar el primer día del mes siguiente en horario local', () => {
      // Período: Agosto 2026 (mes 8). Fecha actual: 1 de Septiembre 2026 a las 00:00:01 en BA (03:00:01 UTC).
      const now = new Date('2026-09-01T03:00:01.000Z');
      expect(canCloseMonthlyAttendancePeriod(2026, 8, tzBA, now)).toBe(true);
    });

    it('rechaza cerrar un mes futuro dentro del mismo año', () => {
      // Período: Octubre 2026 (mes 10). Fecha actual: Agosto 2026 (mes 8).
      const now = new Date('2026-08-15T12:00:00.000Z');
      expect(canCloseMonthlyAttendancePeriod(2026, 10, tzBA, now)).toBe(false);
    });

    it('rechaza cerrar un mes futuro de un año posterior', () => {
      // Período: Enero 2027. Fecha actual: Agosto 2026.
      const now = new Date('2026-08-15T12:00:00.000Z');
      expect(canCloseMonthlyAttendancePeriod(2027, 1, tzBA, now)).toBe(false);
    });

    describe('Boundary tests: Diciembre -> Enero (cambio de año)', () => {
      it('rechaza cerrar Diciembre el 31 de Diciembre a las 23:30 hs local', () => {
        // 31/12/2025 23:30 en BA = 01/01/2026 02:30 UTC
        const now = new Date('2026-01-01T02:30:00.000Z');
        expect(canCloseMonthlyAttendancePeriod(2025, 12, tzBA, now)).toBe(false);
      });

      it('permite cerrar Diciembre el 1 de Enero del año siguiente a las 00:05 hs local', () => {
        // 01/01/2026 00:05 en BA = 01/01/2026 03:05 UTC
        const now = new Date('2026-01-01T03:05:00.000Z');
        expect(canCloseMonthlyAttendancePeriod(2025, 12, tzBA, now)).toBe(true);
      });
    });

    describe('Boundary tests: Febrero bisiesto vs no bisiesto', () => {
      it('rechaza cerrar Febrero bisiesto (2024) el 29 de Febrero', () => {
        // 29/02/2024 15:00 UTC = 29/02/2024 12:00 en BA
        const now = new Date('2024-02-29T15:00:00.000Z');
        expect(canCloseMonthlyAttendancePeriod(2024, 2, tzBA, now)).toBe(false);
      });

      it('permite cerrar Febrero bisiesto (2024) el 1 de Marzo', () => {
        const now = new Date('2024-03-01T15:00:00.000Z');
        expect(canCloseMonthlyAttendancePeriod(2024, 2, tzBA, now)).toBe(true);
      });

      it('rechaza cerrar Febrero no bisiesto (2025) el 28 de Febrero', () => {
        const now = new Date('2025-02-28T15:00:00.000Z');
        expect(canCloseMonthlyAttendancePeriod(2025, 2, tzBA, now)).toBe(false);
      });

      it('permite cerrar Febrero no bisiesto (2025) el 1 de Marzo', () => {
        const now = new Date('2025-03-01T15:00:00.000Z');
        expect(canCloseMonthlyAttendancePeriod(2025, 2, tzBA, now)).toBe(true);
      });
    });
  });

  describe('getLocalYearMonthDay', () => {
    it('extrae correctamente año, mes y día en zona horaria de Buenos Aires', () => {
      // 01/09/2026 01:00 UTC = 31/08/2026 22:00 en Buenos Aires (UTC-3)
      const date = new Date('2026-09-01T01:00:00.000Z');
      const local = getLocalYearMonthDay(date, tzBA);
      expect(local.year).toBe(2026);
      expect(local.month).toBe(8);
      expect(local.day).toBe(31);
    });

    it('aplica fallback ante timezone no reconocido sin arrojar excepción', () => {
      const date = new Date('2026-08-15T12:00:00.000Z');
      const local = getLocalYearMonthDay(date, 'Invalid/Timezone_Name');
      expect(local.year).toBe(2026);
      expect(local.month).toBe(8);
      expect(local.day).toBe(15);
    });
  });
});
