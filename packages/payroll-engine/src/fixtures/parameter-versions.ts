import { RoundingMode } from '@casas/domain';
import {
  FIXTURE_SOURCE_PREFIX,
  LiveInMode,
  ParameterVersionStatus,
  type PayrollParameterVersion,
} from '../parameters';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  DATOS DE PRUEBA — NO SON VALORES OFICIALES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ninguno de los números de este archivo representa una escala salarial, un
 * porcentaje de aporte, una contribución ni un valor de ART vigente en Argentina.
 * Son cifras **inventadas** cuyo único propósito es ejercitar el motor y hacer que
 * sus pruebas sean legibles.
 *
 * El documento de requerimientos no publica valores normativos y sus fuentes
 * (F1..F12, sección 20) deben revisarse antes de cada publicación. La instrucción
 * del encargo es explícita: "No inventes porcentajes ni valores normativos. Utilizá
 * fixtures marcados explícitamente como datos de prueba hasta que los parámetros
 * sean validados por un contador."
 *
 * Cada versión de este archivo declara `isFixture: true` y un `source` con el
 * prefijo reglamentario, de modo que:
 *   - `validateParameterVersion` falla si alguien intenta hacerlas pasar por oficiales;
 *   - el motor emite la advertencia `FIXTURE_PARAMETERS` en todo cálculo que las use;
 *   - `PayrollResult.usedFixtureParameters` llega a la UI para que se muestre el aviso.
 *
 * Sustituirlos por los valores reales es una operación de datos con doble control
 * (CON-11, ADM-02), no un cambio de código.
 * ════════════════════════════════════════════════════════════════════════════
 */

const FIXTURE_PREPARER = '00000000-0000-4000-8000-00000000f001';
const FIXTURE_APPROVER = '00000000-0000-4000-8000-00000000f002';

/** Categorías ficticias. El catálogo real se administra en base de datos (LIQ-03, OD-19). */
export const FIXTURE_CATEGORY = {
  GENERAL_TASKS: 'FIXTURE_CAT_A',
  CHILD_CARE: 'FIXTURE_CAT_B',
} as const;

/** Tipos ficticios de hora extra. Los multiplicadores son inventados. */
export const FIXTURE_OVERTIME_KIND = {
  WEEKDAY: 'FIXTURE_OT_WEEKDAY',
  WEEKEND: 'FIXTURE_OT_WEEKEND',
} as const;

/**
 * Versión ficticia vigente desde 2026-01-01 hasta 2026-06-30.
 * Usada para probar el cambio de escala entre períodos.
 */
export const FIXTURE_PARAMETERS_H1_2026: PayrollParameterVersion = {
  id: '00000000-0000-4000-8000-0000000000a1',
  status: ParameterVersionStatus.PUBLISHED,
  source: `${FIXTURE_SOURCE_PREFIX} — escala ficticia primer semestre 2026`,
  isFixture: true,
  effectiveFrom: '2026-01-01',
  effectiveTo: '2026-06-30',
  currency: 'ARS',

  rounding: {
    conceptDecimals: 2,
    totalDecimals: 2,
    mode: RoundingMode.HALF_UP,
  },

  categories: [
    {
      categoryCode: FIXTURE_CATEGORY.GENERAL_TASKS,
      categoryLabel: 'Tareas generales (categoría de prueba A)',
      liveInMode: LiveInMode.WITH_WITHDRAWAL,
      monthlyMinimum: '300000.00',
      hourlyMinimum: '2000.00',
    },
    {
      categoryCode: FIXTURE_CATEGORY.GENERAL_TASKS,
      categoryLabel: 'Tareas generales (categoría de prueba A)',
      liveInMode: LiveInMode.WITHOUT_WITHDRAWAL,
      monthlyMinimum: '330000.00',
      hourlyMinimum: '2200.00',
    },
    {
      categoryCode: FIXTURE_CATEGORY.CHILD_CARE,
      categoryLabel: 'Cuidado de personas (categoría de prueba B)',
      liveInMode: LiveInMode.WITH_WITHDRAWAL,
      monthlyMinimum: '340000.00',
      hourlyMinimum: '2400.00',
    },
    {
      categoryCode: FIXTURE_CATEGORY.CHILD_CARE,
      categoryLabel: 'Cuidado de personas (categoría de prueba B)',
      liveInMode: LiveInMode.WITHOUT_WITHDRAWAL,
      monthlyMinimum: '370000.00',
      hourlyMinimum: '2600.00',
    },
  ],

  seniority: {
    enabled: true,
    basis: 'BASE_REMUNERATION',
    tiers: [
      { fromCompletedYears: 0, toCompletedYears: 0, percentage: '0' },
      { fromCompletedYears: 1, toCompletedYears: 4, percentage: '1' },
      { fromCompletedYears: 5, toCompletedYears: 9, percentage: '3' },
      { fromCompletedYears: 10, toCompletedYears: null, percentage: '5' },
    ],
  },

  overtime: {
    enabled: true,
    monthlyHoursDivisor: '200',
    kinds: [
      { code: FIXTURE_OVERTIME_KIND.WEEKDAY, label: 'Día hábil (prueba)', multiplier: '1.5' },
      { code: FIXTURE_OVERTIME_KIND.WEEKEND, label: 'Fin de semana (prueba)', multiplier: '2' },
    ],
  },

  holiday: {
    enabled: true,
    workedMultiplier: '2',
    paidWhenNotWorkedHourly: false,
  },

  unfavorableZone: {
    enabled: true,
    zones: [{ code: 'FIXTURE_ZONE_SUR', percentage: '20' }],
  },

  vacation: {
    enabled: true,
    dailyDivisor: '25',
  },

  annualBonus: {
    enabled: true,
    divisor: '2',
  },

  absence: {
    enabled: true,
    dailyDivisor: '30',
  },

  contributions: [
    {
      code: 'FIXTURE_APORTE_A',
      label: 'Aporte de prueba A (a cargo de la trabajadora)',
      percentage: '3',
      borneBy: 'WORKER',
      basis: 'GROSS_REMUNERATION',
    },
    {
      code: 'FIXTURE_APORTE_B',
      label: 'Aporte de prueba B (a cargo de la trabajadora)',
      percentage: '2',
      borneBy: 'WORKER',
      basis: 'GROSS_REMUNERATION',
    },
    {
      code: 'FIXTURE_CONTRIB_A',
      label: 'Contribución de prueba A (a cargo de la familia)',
      percentage: '4',
      borneBy: 'EMPLOYER',
      basis: 'GROSS_REMUNERATION',
    },
  ],

  workRisk: {
    enabled: true,
    code: 'FIXTURE_ART',
    label: 'Cobertura de riesgos del trabajo (prueba)',
    percentage: '1',
    fixedAmount: null,
  },

  preparedByUserId: FIXTURE_PREPARER,
  approvedByUserId: FIXTURE_APPROVER,
  publishedAt: '2025-12-20T12:00:00.000Z',
};

/**
 * Versión ficticia vigente desde 2026-07-01, con escalas más altas.
 * Existe para probar que un período de junio y uno de julio usan versiones distintas
 * y que recalcular junio más tarde sigue dando el resultado de junio (RN-02).
 */
export const FIXTURE_PARAMETERS_H2_2026: PayrollParameterVersion = {
  ...FIXTURE_PARAMETERS_H1_2026,
  id: '00000000-0000-4000-8000-0000000000a2',
  source: `${FIXTURE_SOURCE_PREFIX} — escala ficticia segundo semestre 2026`,
  effectiveFrom: '2026-07-01',
  effectiveTo: null,
  categories: [
    {
      categoryCode: FIXTURE_CATEGORY.GENERAL_TASKS,
      categoryLabel: 'Tareas generales (categoría de prueba A)',
      liveInMode: LiveInMode.WITH_WITHDRAWAL,
      monthlyMinimum: '360000.00',
      hourlyMinimum: '2400.00',
    },
    {
      categoryCode: FIXTURE_CATEGORY.GENERAL_TASKS,
      categoryLabel: 'Tareas generales (categoría de prueba A)',
      liveInMode: LiveInMode.WITHOUT_WITHDRAWAL,
      monthlyMinimum: '396000.00',
      hourlyMinimum: '2640.00',
    },
    {
      categoryCode: FIXTURE_CATEGORY.CHILD_CARE,
      categoryLabel: 'Cuidado de personas (categoría de prueba B)',
      liveInMode: LiveInMode.WITH_WITHDRAWAL,
      monthlyMinimum: '408000.00',
      hourlyMinimum: '2880.00',
    },
    {
      categoryCode: FIXTURE_CATEGORY.CHILD_CARE,
      categoryLabel: 'Cuidado de personas (categoría de prueba B)',
      liveInMode: LiveInMode.WITHOUT_WITHDRAWAL,
      monthlyMinimum: '444000.00',
      hourlyMinimum: '3120.00',
    },
  ],
  publishedAt: '2026-06-20T12:00:00.000Z',
};

export const ALL_FIXTURE_PARAMETER_VERSIONS: readonly PayrollParameterVersion[] = [
  FIXTURE_PARAMETERS_H1_2026,
  FIXTURE_PARAMETERS_H2_2026,
];
