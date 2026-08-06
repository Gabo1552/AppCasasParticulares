import { Minutes, Money } from '@casas/domain';
import { BlockingErrorCode, ConceptCode, FormulaId, WarningCode } from './concepts';
import {
  findCategoryScale,
  ParameterVersionStatus,
  RemunerationScheme,
  validateParameterVersion,
} from './parameters';
import { TraceBuilder } from './trace';
import {
  ConceptSign,
  ENGINE_VERSION,
  EmploymentEventType,
  type PayrollBlockingError,
  type PayrollInput,
  type PayrollLineItem,
  type PayrollObligation,
  type PayrollResult,
  type PayrollWarning,
} from './types';

/**
 * Motor de liquidación.
 *
 * Función **pura y determinista**: la misma entrada produce siempre el mismo
 * resultado, sin leer reloj, entorno, base de datos ni red. De eso dependen dos
 * requisitos del encargo: la idempotencia del cálculo y la posibilidad de recalcular
 * una liquidación histórica con exactamente la norma que regía entonces (RN-02).
 *
 * Lo que produce **no es un recibo**. Es una preliquidación explicada. El recibo
 * oficial se emite en ARCA (principio 7).
 */
export function calculatePayroll(input: PayrollInput): PayrollResult {
  const trace = new TraceBuilder();
  const lineItems: PayrollLineItem[] = [];
  const warnings: PayrollWarning[] = [];
  const blockingErrors: PayrollBlockingError[] = [];
  const obligations: PayrollObligation[] = [];

  const params = input.parameters;
  const { conceptDecimals, totalDecimals, mode } = params.rounding;

  const roundConcept = (money: Money): Money => money.round(conceptDecimals, mode);

  // ── 0. Validaciones previas ───────────────────────────────────────────────

  if (params.isFixture) {
    // Se emite siempre, para que ninguna pantalla presente un fixture como oficial.
    warnings.push({
      code: WarningCode.FIXTURE_PARAMETERS,
      message:
        'Este cálculo usa parámetros de prueba, no oficiales. No debe presentarse como una ' +
        'liquidación válida hasta que un contador matriculado cargue y publique los valores reales.',
      context: { parameterVersionId: params.id, source: params.source },
    });
  }

  const structuralProblems = validateParameterVersion(params);
  for (const problem of structuralProblems) {
    blockingErrors.push({
      code: BlockingErrorCode.PARAMETER_VERSION_INVALID,
      message: problem,
      context: { parameterVersionId: params.id },
    });
  }

  if (params.status !== ParameterVersionStatus.PUBLISHED) {
    blockingErrors.push({
      code: BlockingErrorCode.PARAMETER_VERSION_NOT_PUBLISHED,
      message:
        `La versión de parámetros ${params.id} está en estado ${params.status}. ` +
        'Sólo una versión publicada puede sustentar una liquidación (ADM-02).',
      context: { parameterVersionId: params.id, status: params.status },
    });
  }

  // La versión tiene que regir en el período; si no, el resultado sería una
  // liquidación con la norma equivocada (RN-01, RN-02).
  if (
    input.period.from < params.effectiveFrom ||
    (params.effectiveTo !== null && input.period.to > params.effectiveTo)
  ) {
    blockingErrors.push({
      code: BlockingErrorCode.PARAMETER_VERSION_NOT_EFFECTIVE,
      message:
        `La versión de parámetros ${params.id} rige de ${params.effectiveFrom} a ` +
        `${params.effectiveTo ?? 'sin fin'}, y no cubre el período ${input.period.from} a ${input.period.to}.`,
      context: {
        parameterVersionId: params.id,
        effectiveFrom: params.effectiveFrom,
        effectiveTo: params.effectiveTo,
        periodFrom: input.period.from,
        periodTo: input.period.to,
      },
    });
  }

  if (input.period.month < 1 || input.period.month > 12 || input.period.calendarDays <= 0) {
    blockingErrors.push({
      code: BlockingErrorCode.INVALID_PERIOD,
      message: 'El período tiene mes o cantidad de días fuera de rango.',
      context: { month: input.period.month, calendarDays: input.period.calendarDays },
    });
  }

  const scale = findCategoryScale(params, input.categoryCode, input.liveInMode);
  if (scale === undefined) {
    blockingErrors.push({
      code: BlockingErrorCode.CATEGORY_SCALE_NOT_FOUND,
      message:
        `No hay escala vigente para la categoría "${input.categoryCode}" en modalidad ` +
        `"${input.liveInMode}" dentro de la versión ${params.id}.`,
      context: { categoryCode: input.categoryCode, liveInMode: input.liveInMode },
    });

    // Sin escala no hay base de cálculo posible. Se devuelve el resultado vacío con
    // el error: seguir produciría números inventados.
    return emptyResult(input, blockingErrors, warnings, trace.build());
  }

  const agreed = Money.of(input.agreedRemuneration);

  // ── 1. Comparación contra el mínimo legal (RN-07, LIQ-10) ─────────────────

  const legalMinimum =
    input.remunerationScheme === RemunerationScheme.MONTHLY
      ? Money.of(scale.monthlyMinimum)
      : Money.of(scale.hourlyMinimum);

  if (agreed.lessThan(legalMinimum)) {
    blockingErrors.push({
      code: BlockingErrorCode.BELOW_LEGAL_MINIMUM,
      message:
        `La remuneración pactada (${agreed.toString()}) está por debajo del mínimo vigente ` +
        `(${legalMinimum.toString()}) para la categoría "${scale.categoryLabel}" en modalidad ` +
        `"${input.liveInMode}". El período no puede cerrarse sin resolverlo (LIQ-10, RN-07).`,
      context: {
        agreed: agreed.toString(),
        legalMinimum: legalMinimum.toString(),
        categoryCode: scale.categoryCode,
        liveInMode: input.liveInMode,
        parameterVersionId: params.id,
      },
    });
  }

  trace.add(
    'minimo-legal',
    'Comparación de la remuneración pactada contra el mínimo de la escala vigente',
    {
      pactada: agreed.toString(),
      minimo: legalMinimum.toString(),
      escala: `${scale.categoryCode}/${input.liveInMode}`,
    },
    agreed.lessThan(legalMinimum) ? 'POR DEBAJO DEL MÍNIMO (bloqueante)' : 'OK',
  );

  // ── 2. Valor hora ─────────────────────────────────────────────────────────

  const hourlyValue =
    input.remunerationScheme === RemunerationScheme.MONTHLY
      ? agreed.divide(params.overtime.monthlyHoursDivisor)
      : agreed;

  trace.add(
    'valor-hora',
    input.remunerationScheme === RemunerationScheme.MONTHLY
      ? 'Valor hora derivado de la remuneración mensual'
      : 'Valor hora pactado directamente',
    {
      remuneracion: agreed.toString(),
      divisor:
        input.remunerationScheme === RemunerationScheme.MONTHLY
          ? params.overtime.monthlyHoursDivisor
          : 'n/a',
    },
    hourlyValue.toString(),
  );

  // ── 3. Remuneración base ──────────────────────────────────────────────────

  const normalMinutes = Minutes.of(input.normalMinutes);
  let baseAmount: Money;

  if (input.remunerationScheme === RemunerationScheme.MONTHLY) {
    baseAmount = roundConcept(agreed);
    lineItems.push({
      code: ConceptCode.BASE_MONTHLY,
      label: 'Remuneración mensual',
      sign: ConceptSign.CREDIT,
      calculationBase: agreed.toString(),
      quantity: null,
      rate: null,
      amount: baseAmount.toString(),
      formulaId: FormulaId.BASE_MONTHLY,
      formulaExplanation: 'Remuneración mensual pactada.',
      parameterRef: `categories[${scale.categoryCode}/${input.liveInMode}].monthlyMinimum`,
    });
  } else {
    const hours = normalMinutes.toHours();
    baseAmount = roundConcept(hourlyValue.multiply(hours));
    lineItems.push({
      code: ConceptCode.BASE_HOURLY,
      label: 'Remuneración por hora',
      sign: ConceptSign.CREDIT,
      calculationBase: hourlyValue.toString(),
      quantity: hours.toFixed(4),
      rate: hourlyValue.toString(),
      amount: baseAmount.toString(),
      formulaId: FormulaId.BASE_HOURLY,
      formulaExplanation: `Valor hora × horas normales (${normalMinutes.format()}).`,
      parameterRef: `categories[${scale.categoryCode}/${input.liveInMode}].hourlyMinimum`,
    });
  }

  trace.add(
    'base',
    'Remuneración base del período',
    {
      esquema: input.remunerationScheme,
      minutosNormales: String(input.normalMinutes),
      valorHora: hourlyValue.toString(),
    },
    baseAmount.toString(),
  );

  if (input.normalMinutes === 0 && input.remunerationScheme === RemunerationScheme.HOURLY) {
    warnings.push({
      code: WarningCode.NO_WORKED_TIME,
      message:
        'El período no tiene minutos computables registrados. El sistema no infiere jornadas: ' +
        'si falta un fichaje, corresponde solicitar una corrección (RN-03, FIC-08).',
      context: { payrollPeriodId: input.payrollPeriodId },
    });
  }

  // ── 4. Horas extra (LIQ-05) ───────────────────────────────────────────────

  let overtimeTotal = Money.zero();
  if (params.overtime.enabled) {
    for (const entry of input.overtime) {
      if (entry.minutes === 0) continue;

      const kind = params.overtime.kinds.find((k) => k.code === entry.kindCode);
      if (kind === undefined) {
        warnings.push({
          code: WarningCode.UNKNOWN_OVERTIME_KIND,
          message:
            `El tipo de hora extra "${entry.kindCode}" no existe en la versión de parámetros ` +
            `${params.id}. Los minutos no se liquidaron.`,
          context: { kindCode: entry.kindCode, minutes: entry.minutes },
        });
        continue;
      }

      const hours = Minutes.of(entry.minutes).toHours();
      const rate = hourlyValue.multiply(kind.multiplier);
      const amount = roundConcept(rate.multiply(hours));
      overtimeTotal = overtimeTotal.add(amount);

      lineItems.push({
        code: `${ConceptCode.OVERTIME}:${kind.code}`,
        label: `Horas extra — ${kind.label}`,
        sign: ConceptSign.CREDIT,
        calculationBase: hourlyValue.toString(),
        quantity: hours.toFixed(4),
        rate: kind.multiplier,
        amount: amount.toString(),
        formulaId: FormulaId.OVERTIME,
        formulaExplanation: `Valor hora × ${kind.multiplier} × horas extra (${Minutes.of(entry.minutes).format()}).`,
        parameterRef: `overtime.kinds[${kind.code}].multiplier`,
      });

      trace.add(
        'horas-extra',
        `Horas extra de tipo ${kind.code}`,
        {
          valorHora: hourlyValue.toString(),
          multiplicador: kind.multiplier,
          horas: hours.toFixed(4),
        },
        amount.toString(),
      );
    }
  } else if (input.overtime.some((entry) => entry.minutes > 0)) {
    warnings.push({
      code: WarningCode.RULE_DISABLED,
      message: 'Hay horas extra registradas pero la regla está deshabilitada en los parámetros.',
      context: { parameterVersionId: params.id },
    });
  }

  // ── 5. Feriados trabajados ────────────────────────────────────────────────

  if (params.holiday.enabled && input.holidayMinutes > 0) {
    const hours = Minutes.of(input.holidayMinutes).toHours();
    const rate = hourlyValue.multiply(params.holiday.workedMultiplier);
    const amount = roundConcept(rate.multiply(hours));

    lineItems.push({
      code: ConceptCode.HOLIDAY_WORKED,
      label: 'Feriado trabajado',
      sign: ConceptSign.CREDIT,
      calculationBase: hourlyValue.toString(),
      quantity: hours.toFixed(4),
      rate: params.holiday.workedMultiplier,
      amount: amount.toString(),
      formulaId: FormulaId.HOLIDAY_WORKED,
      formulaExplanation: `Valor hora × ${params.holiday.workedMultiplier} × horas en feriado.`,
      parameterRef: 'holiday.workedMultiplier',
    });

    trace.add(
      'feriado',
      'Horas trabajadas en feriado',
      {
        valorHora: hourlyValue.toString(),
        multiplicador: params.holiday.workedMultiplier,
        horas: hours.toFixed(4),
      },
      amount.toString(),
    );
  }

  // ── 6. Antigüedad (LIQ-06) ────────────────────────────────────────────────

  if (params.seniority.enabled) {
    const completedYears = completedYearsBetween(input.relationshipStartDate, input.period.to);
    const tier = params.seniority.tiers.find(
      (t) =>
        completedYears >= t.fromCompletedYears &&
        (t.toCompletedYears === null || completedYears <= t.toCompletedYears),
    );

    if (tier === undefined) {
      warnings.push({
        code: WarningCode.SENIORITY_TIER_NOT_FOUND,
        message:
          `No hay un tramo de antigüedad para ${completedYears} año(s) cumplidos en la versión ` +
          `${params.id}. No se liquidó adicional por antigüedad.`,
        context: { completedYears, parameterVersionId: params.id },
      });
    } else {
      const seniorityBase =
        params.seniority.basis === 'BASE_PLUS_OVERTIME'
          ? baseAmount.add(overtimeTotal)
          : baseAmount;
      const amount = roundConcept(seniorityBase.applyPercentage(tier.percentage));

      lineItems.push({
        code: ConceptCode.SENIORITY,
        label: `Antigüedad (${completedYears} año/s)`,
        sign: ConceptSign.CREDIT,
        calculationBase: seniorityBase.toString(),
        quantity: String(completedYears),
        rate: `${tier.percentage}%`,
        amount: amount.toString(),
        formulaId: FormulaId.SENIORITY,
        formulaExplanation:
          `${params.seniority.basis === 'BASE_PLUS_OVERTIME' ? 'Base + horas extra' : 'Base'}` +
          ` × ${tier.percentage} % correspondiente al tramo de ${tier.fromCompletedYears} año/s.`,
        parameterRef: `seniority.tiers[${tier.fromCompletedYears}].percentage`,
      });

      trace.add(
        'antiguedad',
        `Adicional por antigüedad, tramo desde ${tier.fromCompletedYears} año(s)`,
        {
          fechaInicio: input.relationshipStartDate,
          aniosCumplidos: String(completedYears),
          base: seniorityBase.toString(),
          porcentaje: tier.percentage,
        },
        amount.toString(),
      );
    }
  }

  // ── 7. Zona desfavorable (OD-18: sin valores cargados) ────────────────────

  if (input.unfavorableZoneCode !== null) {
    const zoneRule = params.unfavorableZone;
    const zone =
      zoneRule?.enabled === true
        ? zoneRule.zones.find((z) => z.code === input.unfavorableZoneCode)
        : undefined;

    if (zone === undefined) {
      warnings.push({
        code: WarningCode.UNFAVORABLE_ZONE_NOT_FOUND,
        message:
          `La relación declara zona desfavorable "${input.unfavorableZoneCode}" pero la versión ` +
          `${params.id} no define esa zona. No se liquidó adicional (OD-18).`,
        context: { zoneCode: input.unfavorableZoneCode, parameterVersionId: params.id },
      });
    } else {
      const amount = roundConcept(baseAmount.applyPercentage(zone.percentage));
      lineItems.push({
        code: ConceptCode.UNFAVORABLE_ZONE,
        label: `Zona desfavorable (${zone.code})`,
        sign: ConceptSign.CREDIT,
        calculationBase: baseAmount.toString(),
        quantity: null,
        rate: `${zone.percentage}%`,
        amount: amount.toString(),
        formulaId: FormulaId.UNFAVORABLE_ZONE,
        formulaExplanation: `Base × ${zone.percentage} % por zona desfavorable.`,
        parameterRef: `unfavorableZone.zones[${zone.code}].percentage`,
      });
    }
  }

  // ── 8. Vacaciones (LIQ-08) ────────────────────────────────────────────────

  const vacationDays = sumApprovedEventDays(input, EmploymentEventType.VACATION, warnings);
  if (params.vacation.enabled && vacationDays > 0) {
    const dailyValue = agreed.divide(params.vacation.dailyDivisor);
    const amount = roundConcept(dailyValue.multiply(vacationDays));

    lineItems.push({
      code: ConceptCode.VACATION,
      label: 'Vacaciones',
      sign: ConceptSign.CREDIT,
      calculationBase: agreed.toString(),
      quantity: String(vacationDays),
      rate: dailyValue.toString(),
      amount: amount.toString(),
      formulaId: FormulaId.VACATION,
      formulaExplanation: `(Remuneración ÷ ${params.vacation.dailyDivisor}) × ${vacationDays} día/s.`,
      parameterRef: 'vacation.dailyDivisor',
    });

    trace.add(
      'vacaciones',
      'Días de vacaciones del período',
      {
        remuneracion: agreed.toString(),
        divisor: params.vacation.dailyDivisor,
        dias: String(vacationDays),
      },
      amount.toString(),
    );
  }

  // ── 9. Aguinaldo (LIQ-08) ─────────────────────────────────────────────────

  if (params.annualBonus.enabled && input.annualBonus.applies) {
    const best = Money.of(input.annualBonus.bestSemesterRemuneration);
    const full = best.divide(params.annualBonus.divisor);
    const proportion = Math.min(Math.max(input.annualBonus.monthsWorkedInSemester, 0), 6);
    const amount = roundConcept(full.multiply(proportion).divide(6));

    lineItems.push({
      code: ConceptCode.ANNUAL_BONUS,
      label: 'Sueldo anual complementario',
      sign: ConceptSign.CREDIT,
      calculationBase: best.toString(),
      quantity: `${proportion}/6`,
      rate: `1/${params.annualBonus.divisor}`,
      amount: amount.toString(),
      formulaId: FormulaId.ANNUAL_BONUS,
      formulaExplanation:
        `(Mejor remuneración del semestre ÷ ${params.annualBonus.divisor}) × ` +
        `${proportion}/6 meses trabajados.`,
      parameterRef: 'annualBonus.divisor',
    });

    trace.add(
      'aguinaldo',
      'Sueldo anual complementario proporcional',
      {
        mejorRemuneracion: best.toString(),
        divisor: params.annualBonus.divisor,
        mesesTrabajados: String(proportion),
      },
      amount.toString(),
    );
  }

  // ── 10. Ausencias y licencias sin goce (LIQ-07) ───────────────────────────

  const unpaidDays =
    sumApprovedEventDays(input, EmploymentEventType.ABSENCE_UNJUSTIFIED, warnings) +
    sumApprovedEventDays(input, EmploymentEventType.UNPAID_LEAVE, warnings);

  if (params.absence.enabled && unpaidDays > 0) {
    const dailyValue = agreed.divide(params.absence.dailyDivisor);
    const amount = roundConcept(dailyValue.multiply(unpaidDays));

    lineItems.push({
      code: ConceptCode.ABSENCE_DEDUCTION,
      label: 'Descuento por ausencias sin goce de haberes',
      sign: ConceptSign.DEBIT,
      calculationBase: agreed.toString(),
      quantity: String(unpaidDays),
      rate: dailyValue.toString(),
      amount: amount.toString(),
      formulaId: FormulaId.ABSENCE_DEDUCTION,
      formulaExplanation: `(Remuneración ÷ ${params.absence.dailyDivisor}) × ${unpaidDays} día/s.`,
      parameterRef: 'absence.dailyDivisor',
    });

    trace.add(
      'ausencias',
      'Descuento por días no trabajados sin goce',
      {
        remuneracion: agreed.toString(),
        divisor: params.absence.dailyDivisor,
        dias: String(unpaidDays),
      },
      amount.toString(),
    );
  }

  // ── 11. Adelantos (LIQ-09) ────────────────────────────────────────────────

  for (const event of input.events) {
    if (event.type !== EmploymentEventType.ADVANCE) continue;
    if (!event.approved) {
      warnings.push({
        code: WarningCode.UNAPPROVED_EVENT_IGNORED,
        message: `El adelanto ${event.id} no está aprobado y no se descontó (RN-05).`,
        context: { eventId: event.id },
      });
      continue;
    }
    const amount = roundConcept(Money.of(event.amount ?? '0'));
    lineItems.push({
      code: ConceptCode.ADVANCE_DEDUCTION,
      label: 'Adelanto de haberes',
      sign: ConceptSign.DEBIT,
      calculationBase: amount.toString(),
      quantity: null,
      rate: null,
      amount: amount.toString(),
      formulaId: FormulaId.ADVANCE_DEDUCTION,
      formulaExplanation: 'Adelanto otorgado y aprobado durante el período.',
      parameterRef: null,
    });
  }

  // ── 12. Conceptos adicionales configurables (LIQ-09) ──────────────────────

  for (const concept of input.additionalConcepts) {
    // LIQ-09: "No se aplica un descuento sin fundamento, límite y aceptación requerida."
    if (concept.sign === 'DEBIT' && concept.justification.trim().length === 0) {
      blockingErrors.push({
        code: BlockingErrorCode.UNJUSTIFIED_DISCOUNT,
        message: `El descuento "${concept.label}" no tiene fundamento registrado (LIQ-09).`,
        context: { conceptCode: concept.code },
      });
      continue;
    }
    if (concept.sign === 'DEBIT' && !concept.acceptedByWorker) {
      warnings.push({
        code: WarningCode.DISCOUNT_NOT_ACCEPTED,
        message: `El descuento "${concept.label}" todavía no fue aceptado por la trabajadora (LIQ-09).`,
        context: { conceptCode: concept.code },
      });
    }

    const amount = roundConcept(Money.of(concept.amount));
    lineItems.push({
      code: `${ConceptCode.ADDITIONAL}:${concept.code}`,
      label: concept.label,
      sign: concept.sign === 'CREDIT' ? ConceptSign.CREDIT : ConceptSign.DEBIT,
      calculationBase: amount.toString(),
      quantity: null,
      rate: null,
      amount: amount.toString(),
      formulaId: FormulaId.ADDITIONAL_FIXED,
      formulaExplanation: concept.justification,
      parameterRef: null,
    });
  }

  // ── 13. Bruto y descuentos ────────────────────────────────────────────────

  const gross = Money.sum(
    lineItems.filter((li) => li.sign === ConceptSign.CREDIT).map((li) => Money.of(li.amount)),
  ).round(totalDecimals, mode);

  trace.add(
    'bruto',
    'Suma de los conceptos que suman al bruto',
    { conceptos: String(lineItems.filter((li) => li.sign === ConceptSign.CREDIT).length) },
    gross.toString(),
  );

  // ── 14. Aportes, contribuciones y ART ─────────────────────────────────────

  let workerDeductions = Money.sum(
    lineItems.filter((li) => li.sign === ConceptSign.DEBIT).map((li) => Money.of(li.amount)),
  );

  for (const contribution of params.contributions) {
    const base = contribution.basis === 'GROSS_REMUNERATION' ? gross : Money.zero();
    const amount =
      contribution.basis === 'FIXED_AMOUNT'
        ? roundConcept(Money.of(contribution.fixedAmount ?? '0'))
        : roundConcept(base.applyPercentage(contribution.percentage));

    obligations.push({
      code: contribution.code,
      label: contribution.label,
      borneBy: contribution.borneBy,
      calculationBase: base.toString(),
      rate: contribution.basis === 'FIXED_AMOUNT' ? null : `${contribution.percentage}%`,
      amount: amount.toString(),
      parameterRef: `contributions[${contribution.code}]`,
      isEstimate: true,
    });

    if (contribution.borneBy === 'WORKER') {
      workerDeductions = workerDeductions.add(amount);
      lineItems.push({
        code: `${ConceptCode.WORKER_CONTRIBUTION}:${contribution.code}`,
        label: contribution.label,
        sign: ConceptSign.DEBIT,
        calculationBase: base.toString(),
        quantity: null,
        rate: contribution.basis === 'FIXED_AMOUNT' ? null : `${contribution.percentage}%`,
        amount: amount.toString(),
        formulaId:
          contribution.basis === 'FIXED_AMOUNT'
            ? FormulaId.CONTRIBUTION_FIXED
            : FormulaId.CONTRIBUTION_PERCENTAGE,
        formulaExplanation:
          contribution.basis === 'FIXED_AMOUNT'
            ? 'Importe fijo definido en los parámetros.'
            : `Bruto × ${contribution.percentage} %.`,
        parameterRef: `contributions[${contribution.code}].percentage`,
      });
    } else {
      // Contribución patronal: no afecta el neto de la trabajadora, pero es una
      // obligación de la familia y por eso aparece como informativa.
      lineItems.push({
        code: `${ConceptCode.EMPLOYER_CONTRIBUTION}:${contribution.code}`,
        label: contribution.label,
        sign: ConceptSign.INFORMATIONAL,
        calculationBase: base.toString(),
        quantity: null,
        rate: contribution.basis === 'FIXED_AMOUNT' ? null : `${contribution.percentage}%`,
        amount: amount.toString(),
        formulaId:
          contribution.basis === 'FIXED_AMOUNT'
            ? FormulaId.CONTRIBUTION_FIXED
            : FormulaId.CONTRIBUTION_PERCENTAGE,
        formulaExplanation:
          contribution.basis === 'FIXED_AMOUNT'
            ? 'Importe fijo a cargo de la familia empleadora.'
            : `Bruto × ${contribution.percentage} %, a cargo de la familia empleadora.`,
        parameterRef: `contributions[${contribution.code}].percentage`,
      });
    }
  }

  if (params.workRisk.enabled) {
    const amount =
      params.workRisk.fixedAmount !== null
        ? roundConcept(Money.of(params.workRisk.fixedAmount))
        : roundConcept(gross.applyPercentage(params.workRisk.percentage));

    obligations.push({
      code: params.workRisk.code,
      label: params.workRisk.label,
      borneBy: 'EMPLOYER',
      calculationBase: params.workRisk.fixedAmount !== null ? '0' : gross.toString(),
      rate: params.workRisk.fixedAmount !== null ? null : `${params.workRisk.percentage}%`,
      amount: amount.toString(),
      parameterRef: 'workRisk',
      isEstimate: true,
    });

    lineItems.push({
      code: ConceptCode.WORK_RISK_INSURANCE,
      label: params.workRisk.label,
      sign: ConceptSign.INFORMATIONAL,
      calculationBase: params.workRisk.fixedAmount !== null ? '0' : gross.toString(),
      quantity: null,
      rate: params.workRisk.fixedAmount !== null ? null : `${params.workRisk.percentage}%`,
      amount: amount.toString(),
      formulaId:
        params.workRisk.fixedAmount !== null
          ? FormulaId.WORK_RISK_FIXED
          : FormulaId.WORK_RISK_PERCENTAGE,
      formulaExplanation: 'Cobertura de riesgos del trabajo, a cargo de la familia empleadora.',
      parameterRef: 'workRisk',
    });
  }

  const deductions = workerDeductions.round(totalDecimals, mode);
  const net = gross.subtract(deductions).round(totalDecimals, mode);

  trace.add(
    'neto',
    'Neto estimado: bruto menos descuentos a cargo de la trabajadora',
    { bruto: gross.toString(), descuentos: deductions.toString() },
    net.toString(),
  );

  if (net.isNegative()) {
    warnings.push({
      code: WarningCode.NEGATIVE_NET,
      message:
        'El neto estimado es negativo: los descuentos superan el bruto. Corresponde revisar ' +
        'adelantos y ausencias antes de aprobar.',
      context: { gross: gross.toString(), deductions: deductions.toString() },
    });
  }

  return {
    employmentRelationshipId: input.employmentRelationshipId,
    payrollPeriodId: input.payrollPeriodId,
    period: input.period,
    lineItems,
    grossEstimate: gross.toString(),
    deductionsEstimate: deductions.toString(),
    netEstimate: net.toString(),
    currency: params.currency,
    estimatedObligations: obligations,
    warnings,
    blockingErrors,
    parameterVersionId: params.id,
    usedFixtureParameters: params.isFixture,
    engineVersion: ENGINE_VERSION,
    trace: trace.build(),
  };
}

// ─── Auxiliares ──────────────────────────────────────────────────────────────

function emptyResult(
  input: PayrollInput,
  blockingErrors: readonly PayrollBlockingError[],
  warnings: readonly PayrollWarning[],
  trace: PayrollResult['trace'],
): PayrollResult {
  return {
    employmentRelationshipId: input.employmentRelationshipId,
    payrollPeriodId: input.payrollPeriodId,
    period: input.period,
    lineItems: [],
    grossEstimate: '0',
    deductionsEstimate: '0',
    netEstimate: '0',
    currency: input.parameters.currency,
    estimatedObligations: [],
    warnings,
    blockingErrors,
    parameterVersionId: input.parameters.id,
    usedFixtureParameters: input.parameters.isFixture,
    engineVersion: ENGINE_VERSION,
    trace,
  };
}

/**
 * Años cumplidos entre dos fechas civiles.
 *
 * Se calcula sobre los componentes de la fecha ISO, sin construir un `Date`: así el
 * resultado no depende del huso horario del proceso, que es un requisito del
 * determinismo del motor.
 */
export function completedYearsBetween(startDate: string, referenceDate: string): number {
  const [startYear = 0, startMonth = 0, startDay = 0] = startDate.split('-').map(Number);
  const [refYear = 0, refMonth = 0, refDay = 0] = referenceDate.split('-').map(Number);

  let years = refYear - startYear;
  if (refMonth < startMonth || (refMonth === startMonth && refDay < startDay)) {
    years -= 1;
  }
  return Math.max(years, 0);
}

/**
 * Suma los días de las novedades aprobadas de un tipo.
 *
 * RN-05: la familia aprueba las novedades. Una novedad sin aprobar no impacta el
 * cálculo — se emite una advertencia en su lugar, para que nadie descuente un día
 * que no fue confirmado.
 */
function sumApprovedEventDays(
  input: PayrollInput,
  type: EmploymentEventType,
  warnings: PayrollWarning[],
): number {
  let total = 0;
  for (const event of input.events) {
    if (event.type !== type) continue;
    if (!event.approved) {
      warnings.push({
        code: WarningCode.UNAPPROVED_EVENT_IGNORED,
        message: `La novedad ${event.id} (${event.type}) no está aprobada y no impactó el cálculo (RN-05).`,
        context: { eventId: event.id, type: event.type },
      });
      continue;
    }
    total += event.days;
  }
  return total;
}
