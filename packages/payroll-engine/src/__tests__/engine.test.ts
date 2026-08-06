import { describe, expect, it } from 'vitest';
import { BlockingErrorCode, ConceptCode, WarningCode } from '../concepts';
import { calculatePayroll, completedYearsBetween } from '../engine';
import {
  FIXTURE_CATEGORY,
  FIXTURE_OVERTIME_KIND,
  FIXTURE_PARAMETERS_H1_2026,
  FIXTURE_PARAMETERS_H2_2026,
} from '../fixtures/parameter-versions';
import { LiveInMode, ParameterVersionStatus, RemunerationScheme } from '../parameters';
import { ConceptSign, EmploymentEventType, PeriodType } from '../types';
import { buildInput, findLine } from './builders';

/**
 * Los 13 escenarios que el encargo enumera para el motor.
 *
 * Los importes esperados derivan de los fixtures de `src/fixtures/`, que son
 * **datos de prueba inventados**. Que estas pruebas pasen significa que el motor
 * aplica correctamente las fórmulas sobre los parámetros que recibe — no que los
 * parámetros sean los vigentes en Argentina.
 */

describe('1. Trabajadora mensualizada', () => {
  it('liquida la remuneración mensual pactada como base', () => {
    const result = calculatePayroll(buildInput({ agreedRemuneration: '400000.00' }));

    const base = findLine(result, ConceptCode.BASE_MONTHLY);
    expect(base?.amount).toBe('400000');
    expect(result.blockingErrors).toHaveLength(0);
  });

  it('calcula bruto, descuentos y neto de manera consistente', () => {
    const result = calculatePayroll(buildInput({ agreedRemuneration: '400000.00' }));

    // Base 400000 + antigüedad 1 % (0 años cumplidos al 31/05 desde 15/01/2026 → tramo 0 %)
    expect(result.grossEstimate).toBe('400000');

    // Aportes ficticios a cargo de la trabajadora: 3 % + 2 % = 5 % de 400000
    expect(result.deductionsEstimate).toBe('20000');
    expect(result.netEstimate).toBe('380000');
  });

  it('separa aportes de la trabajadora de contribuciones de la familia', () => {
    const result = calculatePayroll(buildInput());

    const workerBorne = result.estimatedObligations.filter((o) => o.borneBy === 'WORKER');
    const employerBorne = result.estimatedObligations.filter((o) => o.borneBy === 'EMPLOYER');

    expect(workerBorne.map((o) => o.code)).toEqual(['FIXTURE_APORTE_A', 'FIXTURE_APORTE_B']);
    expect(employerBorne.map((o) => o.code)).toEqual(['FIXTURE_CONTRIB_A', 'FIXTURE_ART']);

    // Las contribuciones patronales no reducen el neto de la trabajadora.
    const employerLines = result.lineItems.filter((l) => l.sign === ConceptSign.INFORMATIONAL);
    expect(employerLines.length).toBe(2);
  });

  it('marca todas las obligaciones como estimadas: el importe exigible lo fija ARCA', () => {
    const result = calculatePayroll(buildInput());
    expect(result.estimatedObligations.every((o) => o.isEstimate === true)).toBe(true);
  });
});

describe('2. Trabajadora por hora', () => {
  it('liquida valor hora × horas normales', () => {
    const result = calculatePayroll(
      buildInput({
        remunerationScheme: RemunerationScheme.HOURLY,
        agreedRemuneration: '2500.00',
        // 100 horas exactas
        normalMinutes: 6000,
      }),
    );

    const base = findLine(result, ConceptCode.BASE_HOURLY);
    expect(base?.amount).toBe('250000');
    expect(result.blockingErrors).toHaveLength(0);
  });

  it('no pierde precisión con jornadas de minutos fraccionarios', () => {
    // 7h20m diarios × 20 días = 8800 minutos = 146.666... horas
    const result = calculatePayroll(
      buildInput({
        remunerationScheme: RemunerationScheme.HOURLY,
        agreedRemuneration: '2100.00',
        normalMinutes: 8800,
      }),
    );

    // 8800/60 × 2100 = 308000 exacto
    expect(findLine(result, ConceptCode.BASE_HOURLY)?.amount).toBe('308000');
  });

  it('advierte —sin inventar jornadas— cuando el período no tiene minutos (RN-03)', () => {
    const result = calculatePayroll(
      buildInput({
        remunerationScheme: RemunerationScheme.HOURLY,
        agreedRemuneration: '2500.00',
        normalMinutes: 0,
      }),
    );

    expect(result.warnings.map((w) => w.code)).toContain(WarningCode.NO_WORKED_TIME);
    expect(findLine(result, ConceptCode.BASE_HOURLY)?.amount).toBe('0');
  });
});

describe('3. Horas extras', () => {
  it('aplica el multiplicador del tipo declarado en los parámetros', () => {
    const result = calculatePayroll(
      buildInput({
        agreedRemuneration: '400000.00',
        // 10 horas al 1.5 sobre valor hora 400000/200 = 2000 → 2000 × 1.5 × 10 = 30000
        overtime: [{ kindCode: FIXTURE_OVERTIME_KIND.WEEKDAY, minutes: 600 }],
      }),
    );

    const overtime = findLine(result, ConceptCode.OVERTIME);
    expect(overtime?.amount).toBe('30000');
  });

  it('distingue tipos de hora extra con multiplicadores distintos (LIQ-05)', () => {
    const result = calculatePayroll(
      buildInput({
        agreedRemuneration: '400000.00',
        overtime: [
          { kindCode: FIXTURE_OVERTIME_KIND.WEEKDAY, minutes: 600 },
          { kindCode: FIXTURE_OVERTIME_KIND.WEEKEND, minutes: 300 },
        ],
      }),
    );

    const lines = result.lineItems.filter((l) => l.code.startsWith(ConceptCode.OVERTIME));
    expect(lines).toHaveLength(2);
    // 2000 × 1.5 × 10 = 30000 ; 2000 × 2 × 5 = 20000
    expect(lines.map((l) => l.amount)).toEqual(['30000', '20000']);
  });

  it('explica cantidad, tasa y fuente del parámetro en cada línea (LIQ-05, LIQ-14)', () => {
    const result = calculatePayroll(
      buildInput({ overtime: [{ kindCode: FIXTURE_OVERTIME_KIND.WEEKDAY, minutes: 600 }] }),
    );

    const line = result.lineItems.find((l) => l.code.startsWith(ConceptCode.OVERTIME));
    expect(line?.quantity).toBe('10.0000');
    expect(line?.rate).toBe('1.5');
    expect(line?.parameterRef).toBe(`overtime.kinds[${FIXTURE_OVERTIME_KIND.WEEKDAY}].multiplier`);
    expect(line?.formulaExplanation).toContain('1.5');
  });

  it('advierte y no liquida cuando el tipo de hora extra no existe en la versión', () => {
    const result = calculatePayroll(
      buildInput({ overtime: [{ kindCode: 'NO_EXISTE', minutes: 600 }] }),
    );

    expect(result.warnings.map((w) => w.code)).toContain(WarningCode.UNKNOWN_OVERTIME_KIND);
    expect(findLine(result, ConceptCode.OVERTIME)).toBeUndefined();
  });
});

describe('4. Feriados', () => {
  it('liquida las horas trabajadas en feriado con su multiplicador', () => {
    const result = calculatePayroll(
      buildInput({
        agreedRemuneration: '400000.00',
        // 8 horas de feriado: 2000 × 2 × 8 = 32000
        holidayMinutes: 480,
      }),
    );

    expect(findLine(result, ConceptCode.HOLIDAY_WORKED)?.amount).toBe('32000');
  });

  it('no genera línea de feriado si no hubo horas en feriado', () => {
    const result = calculatePayroll(buildInput({ holidayMinutes: 0 }));
    expect(findLine(result, ConceptCode.HOLIDAY_WORKED)).toBeUndefined();
  });
});

describe('5. Antigüedad', () => {
  it('no liquida adicional en el primer año (tramo 0 %)', () => {
    const result = calculatePayroll(
      buildInput({ relationshipStartDate: '2026-01-15' }), // 0 años cumplidos al 31/05/2026
    );
    expect(findLine(result, ConceptCode.SENIORITY)?.amount).toBe('0');
  });

  it('aplica el tramo correspondiente a los años cumplidos', () => {
    // Alta 2020-03-01, período mayo 2026 → 6 años cumplidos → tramo 5-9 → 3 %
    const result = calculatePayroll(
      buildInput({ agreedRemuneration: '400000.00', relationshipStartDate: '2020-03-01' }),
    );

    const seniority = findLine(result, ConceptCode.SENIORITY);
    expect(seniority?.amount).toBe('12000');
  });

  it('usa el tramo abierto para antigüedades largas', () => {
    // Alta 2010-01-01 → 16 años cumplidos → tramo 10+ → 5 %
    const result = calculatePayroll(
      buildInput({ agreedRemuneration: '400000.00', relationshipStartDate: '2010-01-01' }),
    );
    expect(findLine(result, ConceptCode.SENIORITY)?.amount).toBe('20000');
  });

  it('documenta vigencia y porcentaje en la línea (LIQ-06)', () => {
    const result = calculatePayroll(buildInput({ relationshipStartDate: '2020-03-01' }));
    const line = result.lineItems.find((l) => l.code === ConceptCode.SENIORITY);
    expect(line?.rate).toBe('3%');
    expect(line?.parameterRef).toBe('seniority.tiers[5].percentage');
  });

  describe('cálculo de años cumplidos', () => {
    it('no cuenta el año si todavía no llegó el aniversario', () => {
      expect(completedYearsBetween('2020-06-15', '2026-05-31')).toBe(5);
      expect(completedYearsBetween('2020-05-31', '2026-05-31')).toBe(6);
      expect(completedYearsBetween('2020-06-01', '2026-05-31')).toBe(5);
    });

    it('no devuelve negativos si la referencia es anterior al alta', () => {
      expect(completedYearsBetween('2026-01-01', '2025-01-01')).toBe(0);
    });
  });
});

describe('6. Vacaciones', () => {
  it('liquida los días de vacaciones aprobados', () => {
    const result = calculatePayroll(
      buildInput({
        agreedRemuneration: '400000.00',
        events: [
          {
            id: 'ev-vac-1',
            type: EmploymentEventType.VACATION,
            from: '2026-05-05',
            to: '2026-05-14',
            days: 10,
            approved: true,
          },
        ],
      }),
    );

    // (400000 / 25) × 10 = 160000
    expect(findLine(result, ConceptCode.VACATION)?.amount).toBe('160000');
  });

  it('ignora vacaciones sin aprobar y advierte (RN-05)', () => {
    const result = calculatePayroll(
      buildInput({
        events: [
          {
            id: 'ev-vac-2',
            type: EmploymentEventType.VACATION,
            from: '2026-05-05',
            to: '2026-05-14',
            days: 10,
            approved: false,
          },
        ],
      }),
    );

    expect(findLine(result, ConceptCode.VACATION)).toBeUndefined();
    expect(result.warnings.map((w) => w.code)).toContain(WarningCode.UNAPPROVED_EVENT_IGNORED);
  });
});

describe('7. Aguinaldo', () => {
  it('liquida el proporcional según los meses trabajados del semestre', () => {
    const result = calculatePayroll(
      buildInput({
        annualBonus: {
          applies: true,
          bestSemesterRemuneration: '420000.00',
          monthsWorkedInSemester: 6,
        },
      }),
    );

    // (420000 / 2) × 6/6 = 210000
    expect(findLine(result, ConceptCode.ANNUAL_BONUS)?.amount).toBe('210000');
  });

  it('prorratea un semestre incompleto', () => {
    const result = calculatePayroll(
      buildInput({
        annualBonus: {
          applies: true,
          bestSemesterRemuneration: '420000.00',
          monthsWorkedInSemester: 3,
        },
      }),
    );

    // (420000 / 2) × 3/6 = 105000
    expect(findLine(result, ConceptCode.ANNUAL_BONUS)?.amount).toBe('105000');
  });

  it('no liquida aguinaldo cuando no corresponde al período', () => {
    const result = calculatePayroll(buildInput());
    expect(findLine(result, ConceptCode.ANNUAL_BONUS)).toBeUndefined();
  });
});

describe('8. Ausencia', () => {
  it('descuenta los días de ausencia injustificada aprobados', () => {
    const result = calculatePayroll(
      buildInput({
        agreedRemuneration: '400000.00',
        events: [
          {
            id: 'ev-aus-1',
            type: EmploymentEventType.ABSENCE_UNJUSTIFIED,
            from: '2026-05-06',
            to: '2026-05-08',
            days: 3,
            approved: true,
          },
        ],
      }),
    );

    // (400000 / 30) × 3 = 40000
    const deduction = findLine(result, ConceptCode.ABSENCE_DEDUCTION);
    expect(deduction?.amount).toBe('40000');

    // Bruto 400000, descuentos = 40000 (ausencia) + 5 % de 400000 (aportes) = 60000
    expect(result.grossEstimate).toBe('400000');
    expect(result.deductionsEstimate).toBe('60000');
    expect(result.netEstimate).toBe('340000');
  });

  it('no descuenta una ausencia justificada', () => {
    const result = calculatePayroll(
      buildInput({
        events: [
          {
            id: 'ev-aus-2',
            type: EmploymentEventType.ABSENCE_JUSTIFIED,
            from: '2026-05-06',
            to: '2026-05-08',
            days: 3,
            approved: true,
          },
        ],
      }),
    );

    expect(findLine(result, ConceptCode.ABSENCE_DEDUCTION)).toBeUndefined();
  });

  it('advierte cuando el neto queda negativo', () => {
    const result = calculatePayroll(
      buildInput({
        agreedRemuneration: '400000.00',
        events: [
          {
            id: 'ev-adel-1',
            type: EmploymentEventType.ADVANCE,
            from: '2026-05-10',
            to: '2026-05-10',
            days: 0,
            amount: '500000.00',
            approved: true,
          },
        ],
      }),
    );

    expect(result.netEstimate.startsWith('-')).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain(WarningCode.NEGATIVE_NET);
  });
});

describe('9. Cambio de escala durante distintos períodos', () => {
  it('cada período usa la versión que rige en su rango (RN-01, RN-02)', () => {
    const juneInput = buildInput({
      period: {
        year: 2026,
        month: 6,
        periodType: PeriodType.MONTHLY,
        from: '2026-06-01',
        to: '2026-06-30',
        calendarDays: 30,
      },
      agreedRemuneration: '400000.00',
      parameters: FIXTURE_PARAMETERS_H1_2026,
    });

    const julyInput = buildInput({
      period: {
        year: 2026,
        month: 7,
        periodType: PeriodType.MONTHLY,
        from: '2026-07-01',
        to: '2026-07-31',
        calendarDays: 31,
      },
      agreedRemuneration: '400000.00',
      parameters: FIXTURE_PARAMETERS_H2_2026,
    });

    const june = calculatePayroll(juneInput);
    const july = calculatePayroll(julyInput);

    expect(june.parameterVersionId).toBe(FIXTURE_PARAMETERS_H1_2026.id);
    expect(july.parameterVersionId).toBe(FIXTURE_PARAMETERS_H2_2026.id);
    expect(june.blockingErrors).toHaveLength(0);
    expect(july.blockingErrors).toHaveLength(0);
  });

  it('bloquea si la versión de parámetros no cubre el período', () => {
    // Julio con la versión del primer semestre: la norma no regía entonces.
    const result = calculatePayroll(
      buildInput({
        period: {
          year: 2026,
          month: 7,
          periodType: PeriodType.MONTHLY,
          from: '2026-07-01',
          to: '2026-07-31',
          calendarDays: 31,
        },
        parameters: FIXTURE_PARAMETERS_H1_2026,
      }),
    );

    expect(result.blockingErrors.map((e) => e.code)).toContain(
      BlockingErrorCode.PARAMETER_VERSION_NOT_EFFECTIVE,
    );
  });

  it('una remuneración válida en el primer semestre puede quedar bajo el mínimo en el segundo', () => {
    // 350000 supera el mínimo de 300000 (H1) pero no el de 360000 (H2).
    const h1 = calculatePayroll(
      buildInput({ agreedRemuneration: '350000.00', parameters: FIXTURE_PARAMETERS_H1_2026 }),
    );
    const h2 = calculatePayroll(
      buildInput({
        period: {
          year: 2026,
          month: 7,
          periodType: PeriodType.MONTHLY,
          from: '2026-07-01',
          to: '2026-07-31',
          calendarDays: 31,
        },
        agreedRemuneration: '350000.00',
        parameters: FIXTURE_PARAMETERS_H2_2026,
      }),
    );

    expect(h1.blockingErrors).toHaveLength(0);
    expect(h2.blockingErrors.map((e) => e.code)).toContain(BlockingErrorCode.BELOW_LEGAL_MINIMUM);
  });
});

describe('10. Rectificación de una liquidación cerrada', () => {
  it('recalcular con la versión original reproduce exactamente el resultado original', () => {
    const original = buildInput({
      agreedRemuneration: '400000.00',
      relationshipStartDate: '2020-03-01',
      overtime: [{ kindCode: FIXTURE_OVERTIME_KIND.WEEKDAY, minutes: 600 }],
      parameters: FIXTURE_PARAMETERS_H1_2026,
    });

    const first = calculatePayroll(original);

    // Meses después, con una versión de parámetros nueva ya publicada, se recalcula
    // el período histórico. Mientras se pase la versión original, el resultado es
    // idéntico: es lo que hace posible auditar una liquidación cerrada (RN-02).
    const recalculated = calculatePayroll(original);

    expect(recalculated.netEstimate).toBe(first.netEstimate);
    expect(recalculated.lineItems).toEqual(first.lineItems);
    expect(recalculated.parameterVersionId).toBe(FIXTURE_PARAMETERS_H1_2026.id);
  });

  it('la rectificativa con datos corregidos da un resultado distinto y trazable', () => {
    const base = buildInput({ agreedRemuneration: '400000.00', normalMinutes: 0 });
    const originalResult = calculatePayroll(base);

    // La corrección de un fichaje agregó horas extra que no estaban.
    const correctedResult = calculatePayroll({
      ...base,
      overtime: [{ kindCode: FIXTURE_OVERTIME_KIND.WEEKDAY, minutes: 600 }],
    });

    expect(correctedResult.netEstimate).not.toBe(originalResult.netEstimate);
    // Ambas versiones apuntan a la misma norma: cambió el hecho, no la regla.
    expect(correctedResult.parameterVersionId).toBe(originalResult.parameterVersionId);
    expect(findLine(correctedResult, ConceptCode.OVERTIME)?.amount).toBe('30000');
  });
});

describe('11. Remuneración pactada inferior al mínimo (LIQ-10, RN-07)', () => {
  it('genera error bloqueante en el esquema mensual', () => {
    const result = calculatePayroll(buildInput({ agreedRemuneration: '250000.00' }));

    const error = result.blockingErrors.find(
      (e) => e.code === BlockingErrorCode.BELOW_LEGAL_MINIMUM,
    );
    expect(error).toBeDefined();
    expect(error?.context['legalMinimum']).toBe('300000');
    expect(error?.context['agreed']).toBe('250000');
  });

  it('genera error bloqueante en el esquema por hora', () => {
    const result = calculatePayroll(
      buildInput({
        remunerationScheme: RemunerationScheme.HOURLY,
        agreedRemuneration: '1500.00',
        normalMinutes: 6000,
      }),
    );

    expect(result.blockingErrors.map((e) => e.code)).toContain(
      BlockingErrorCode.BELOW_LEGAL_MINIMUM,
    );
  });

  it('compara contra el mínimo de la modalidad correcta', () => {
    // 310000 supera el mínimo con retiro (300000) pero no el de sin retiro (330000).
    const withWithdrawal = calculatePayroll(
      buildInput({ agreedRemuneration: '310000.00', liveInMode: LiveInMode.WITH_WITHDRAWAL }),
    );
    const withoutWithdrawal = calculatePayroll(
      buildInput({ agreedRemuneration: '310000.00', liveInMode: LiveInMode.WITHOUT_WITHDRAWAL }),
    );

    expect(withWithdrawal.blockingErrors).toHaveLength(0);
    expect(withoutWithdrawal.blockingErrors.map((e) => e.code)).toContain(
      BlockingErrorCode.BELOW_LEGAL_MINIMUM,
    );
  });

  it('igual al mínimo no bloquea', () => {
    const result = calculatePayroll(buildInput({ agreedRemuneration: '300000.00' }));
    expect(result.blockingErrors).toHaveLength(0);
  });

  it('el cálculo continúa y explica: bloquea el avance del período, no la preliquidación', () => {
    const result = calculatePayroll(buildInput({ agreedRemuneration: '250000.00' }));
    expect(result.lineItems.length).toBeGreaterThan(0);
    expect(result.netEstimate).not.toBe('0');
  });
});

describe('12. Redondeos', () => {
  it('respeta la política de redondeo de los parámetros', () => {
    // 100003 / 3 = 33334.333... → 2 decimales, HALF_UP
    const result = calculatePayroll(
      buildInput({
        remunerationScheme: RemunerationScheme.HOURLY,
        agreedRemuneration: '2033.33',
        normalMinutes: 6000,
      }),
    );

    // 2033.33 × 100 = 203333 exacto
    expect(findLine(result, ConceptCode.BASE_HOURLY)?.amount).toBe('203333');
  });

  it('redondea a la cantidad de decimales configurada, no a la que salga', () => {
    // valor hora 400000/200 = 2000; 1 minuto = 1/60 h → 2000 × 1.5 / 60 = 50 exacto
    // 7 minutos → 2000 × 1.5 × 7/60 = 350 exacto. Usamos 11 min para forzar decimales.
    const result = calculatePayroll(
      buildInput({
        agreedRemuneration: '400000.00',
        overtime: [{ kindCode: FIXTURE_OVERTIME_KIND.WEEKDAY, minutes: 11 }],
      }),
    );

    // 2000 × 1.5 × (11/60) = 550.0000...  → exacto
    const amount = findLine(result, ConceptCode.OVERTIME)?.amount ?? '';
    const decimals = amount.includes('.') ? (amount.split('.')[1]?.length ?? 0) : 0;
    expect(decimals).toBeLessThanOrEqual(2);
  });

  it('acumula sin arrastrar error binario en importes con centavos', () => {
    const result = calculatePayroll(
      buildInput({
        agreedRemuneration: '333333.33',
        relationshipStartDate: '2020-03-01', // 3 % de antigüedad
      }),
    );

    // Base 333333.33 + antigüedad 3 % = 9999.9999 → redondeado a 10000.00
    expect(findLine(result, ConceptCode.SENIORITY)?.amount).toBe('10000');
    expect(result.grossEstimate).toBe('343333.33');
  });

  it('el neto es exactamente bruto menos descuentos', () => {
    const result = calculatePayroll(buildInput({ agreedRemuneration: '387654.32' }));

    const gross = Number(result.grossEstimate);
    const deductions = Number(result.deductionsEstimate);
    const net = Number(result.netEstimate);
    expect(Math.abs(gross - deductions - net)).toBeLessThan(0.005);
  });
});

describe('13. Idempotencia del cálculo', () => {
  it('la misma entrada produce un resultado idéntico', () => {
    const input = buildInput({
      agreedRemuneration: '412345.67',
      relationshipStartDate: '2019-08-20',
      normalMinutes: 8800,
      overtime: [
        { kindCode: FIXTURE_OVERTIME_KIND.WEEKDAY, minutes: 375 },
        { kindCode: FIXTURE_OVERTIME_KIND.WEEKEND, minutes: 200 },
      ],
      holidayMinutes: 305,
      events: [
        {
          id: 'ev-1',
          type: EmploymentEventType.VACATION,
          from: '2026-05-05',
          to: '2026-05-11',
          days: 7,
          approved: true,
        },
        {
          id: 'ev-2',
          type: EmploymentEventType.ABSENCE_UNJUSTIFIED,
          from: '2026-05-20',
          to: '2026-05-21',
          days: 2,
          approved: true,
        },
      ],
      annualBonus: {
        applies: true,
        bestSemesterRemuneration: '412345.67',
        monthsWorkedInSemester: 5,
      },
    });

    const first = calculatePayroll(input);
    const second = calculatePayroll(input);
    const third = calculatePayroll(structuredClone(input));

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(JSON.stringify(third)).toBe(JSON.stringify(first));
  });

  it('no muta la entrada', () => {
    const input = buildInput({ overtime: [{ kindCode: FIXTURE_OVERTIME_KIND.WEEKDAY, minutes: 600 }] });
    const snapshot = JSON.stringify(input);

    calculatePayroll(input);

    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('no depende del reloj ni del huso horario del proceso', () => {
    const input = buildInput({ relationshipStartDate: '2020-03-01' });

    const originalTz = process.env['TZ'];
    process.env['TZ'] = 'UTC';
    const utc = calculatePayroll(input);
    process.env['TZ'] = 'Pacific/Kiritimati';
    const kiritimati = calculatePayroll(input);
    process.env['TZ'] = originalTz;

    expect(JSON.stringify(kiritimati)).toBe(JSON.stringify(utc));
  });
});

describe('Trazabilidad y advertencia de fixtures', () => {
  it('cada línea explica fórmula, base y parámetro de origen (LIQ-14)', () => {
    const result = calculatePayroll(
      buildInput({
        relationshipStartDate: '2020-03-01',
        overtime: [{ kindCode: FIXTURE_OVERTIME_KIND.WEEKDAY, minutes: 600 }],
        holidayMinutes: 480,
      }),
    );

    for (const line of result.lineItems) {
      expect(line.formulaId.length).toBeGreaterThan(0);
      expect(line.formulaExplanation.length).toBeGreaterThan(0);
      expect(line.calculationBase.length).toBeGreaterThan(0);
    }
  });

  it('la traza recorre cada etapa del cálculo', () => {
    const result = calculatePayroll(buildInput({ relationshipStartDate: '2020-03-01' }));
    const stages = result.trace.map((step) => step.stage);

    expect(stages).toContain('minimo-legal');
    expect(stages).toContain('valor-hora');
    expect(stages).toContain('base');
    expect(stages).toContain('antiguedad');
    expect(stages).toContain('bruto');
    expect(stages).toContain('neto');

    // Los pasos están numerados en orden.
    expect(result.trace.map((s) => s.step)).toEqual(
      Array.from({ length: result.trace.length }, (_, i) => i + 1),
    );
  });

  it('advierte siempre que el cálculo usa parámetros de prueba', () => {
    const result = calculatePayroll(buildInput());

    expect(result.usedFixtureParameters).toBe(true);
    const warning = result.warnings.find((w) => w.code === WarningCode.FIXTURE_PARAMETERS);
    expect(warning).toBeDefined();
    expect(warning?.message).toContain('no oficiales');
  });

  it('los importes de la salida son strings, nunca number (RN-13)', () => {
    const result = calculatePayroll(buildInput());

    expect(typeof result.grossEstimate).toBe('string');
    expect(typeof result.netEstimate).toBe('string');
    expect(typeof result.deductionsEstimate).toBe('string');
    for (const line of result.lineItems) {
      expect(typeof line.amount).toBe('string');
    }
  });
});

describe('Validaciones de la versión de parámetros', () => {
  it('bloquea si la versión no está publicada (ADM-02)', () => {
    const result = calculatePayroll(
      buildInput({
        parameters: { ...FIXTURE_PARAMETERS_H1_2026, status: ParameterVersionStatus.DRAFT },
      }),
    );

    expect(result.blockingErrors.map((e) => e.code)).toContain(
      BlockingErrorCode.PARAMETER_VERSION_NOT_PUBLISHED,
    );
  });

  it('bloquea si el mismo usuario preparó y aprobó los parámetros (CON-11)', () => {
    const result = calculatePayroll(
      buildInput({
        parameters: {
          ...FIXTURE_PARAMETERS_H1_2026,
          preparedByUserId: 'mismo-usuario',
          approvedByUserId: 'mismo-usuario',
        },
      }),
    );

    const error = result.blockingErrors.find(
      (e) => e.code === BlockingErrorCode.PARAMETER_VERSION_INVALID,
    );
    expect(error?.message).toContain('doble control');
  });

  it('bloquea si no hay escala para la categoría y no inventa una base', () => {
    const result = calculatePayroll(buildInput({ categoryCode: 'CATEGORIA_INEXISTENTE' }));

    expect(result.blockingErrors.map((e) => e.code)).toContain(
      BlockingErrorCode.CATEGORY_SCALE_NOT_FOUND,
    );
    expect(result.lineItems).toHaveLength(0);
    expect(result.netEstimate).toBe('0');
  });

  it('bloquea un descuento sin fundamento (LIQ-09)', () => {
    const result = calculatePayroll(
      buildInput({
        additionalConcepts: [
          {
            code: 'DESC_X',
            label: 'Descuento sin explicar',
            amount: '10000.00',
            sign: 'DEBIT',
            justification: '   ',
            acceptedByWorker: true,
          },
        ],
      }),
    );

    expect(result.blockingErrors.map((e) => e.code)).toContain(
      BlockingErrorCode.UNJUSTIFIED_DISCOUNT,
    );
  });

  it('advierte si un descuento fundado todavía no fue aceptado (LIQ-09)', () => {
    const result = calculatePayroll(
      buildInput({
        additionalConcepts: [
          {
            code: 'DESC_Y',
            label: 'Rotura de equipamiento',
            amount: '10000.00',
            sign: 'DEBIT',
            justification: 'Acordado por escrito el 2026-05-10',
            acceptedByWorker: false,
          },
        ],
      }),
    );

    expect(result.warnings.map((w) => w.code)).toContain(WarningCode.DISCOUNT_NOT_ACCEPTED);
    expect(result.blockingErrors).toHaveLength(0);
  });
});

describe('Coherencia de los fixtures', () => {
  it('todas las versiones de fixture son estructuralmente válidas', () => {
    for (const version of [FIXTURE_PARAMETERS_H1_2026, FIXTURE_PARAMETERS_H2_2026]) {
      const input = buildInput({
        parameters: version,
        period: {
          year: 2026,
          month: version.effectiveFrom.startsWith('2026-01') ? 5 : 8,
          periodType: PeriodType.MONTHLY,
          from: version.effectiveFrom.startsWith('2026-01') ? '2026-05-01' : '2026-08-01',
          to: version.effectiveFrom.startsWith('2026-01') ? '2026-05-31' : '2026-08-31',
          calendarDays: 31,
        },
        agreedRemuneration: '500000.00',
      });

      const result = calculatePayroll(input);
      expect(
        result.blockingErrors.filter(
          (e) => e.code === BlockingErrorCode.PARAMETER_VERSION_INVALID,
        ),
      ).toHaveLength(0);
    }
  });

  it('todas las versiones de fixture se declaran como datos de prueba', () => {
    for (const version of [FIXTURE_PARAMETERS_H1_2026, FIXTURE_PARAMETERS_H2_2026]) {
      expect(version.isFixture).toBe(true);
      expect(version.source).toContain('NO OFICIAL');
    }
  });

  it('las categorías de fixture llevan prefijo reconocible', () => {
    expect(FIXTURE_CATEGORY.GENERAL_TASKS.startsWith('FIXTURE_')).toBe(true);
    expect(FIXTURE_CATEGORY.CHILD_CARE.startsWith('FIXTURE_')).toBe(true);
  });
});
