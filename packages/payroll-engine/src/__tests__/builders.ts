import { LiveInMode, RemunerationScheme } from '../parameters';
import { FIXTURE_CATEGORY, FIXTURE_PARAMETERS_H1_2026 } from '../fixtures/parameter-versions';
import { PeriodType, type PayrollInput } from '../types';

/**
 * Constructor de entradas para las pruebas.
 *
 * Todos los datos son ficticios. El valor por defecto es una trabajadora mensualizada,
 * con retiro, sin novedades: cada prueba sobrescribe sólo lo que le importa, de modo
 * que el diff entre escenarios sea legible.
 */
export function buildInput(overrides: Partial<PayrollInput> = {}): PayrollInput {
  return {
    employmentRelationshipId: '00000000-0000-4000-8000-0000000000e1',
    payrollPeriodId: '00000000-0000-4000-8000-0000000000p1',
    period: {
      year: 2026,
      month: 5,
      periodType: PeriodType.MONTHLY,
      from: '2026-05-01',
      to: '2026-05-31',
      calendarDays: 31,
    },
    categoryCode: FIXTURE_CATEGORY.GENERAL_TASKS,
    liveInMode: LiveInMode.WITH_WITHDRAWAL,
    remunerationScheme: RemunerationScheme.MONTHLY,
    agreedRemuneration: '400000.00',
    parameters: FIXTURE_PARAMETERS_H1_2026,
    normalMinutes: 0,
    overtime: [],
    holidayMinutes: 0,
    relationshipStartDate: '2026-01-15',
    unfavorableZoneCode: null,
    events: [],
    annualBonus: {
      applies: false,
      bestSemesterRemuneration: '0',
      monthsWorkedInSemester: 0,
    },
    additionalConcepts: [],
    ...overrides,
  };
}

/** Busca una línea por prefijo de código, para no acoplar las pruebas al sufijo. */
export function findLine(
  result: { lineItems: readonly { code: string; amount: string }[] },
  codePrefix: string,
): { code: string; amount: string } | undefined {
  return result.lineItems.find((line) => line.code.startsWith(codePrefix));
}
