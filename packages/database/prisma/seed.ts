/**
 * Datos de demostración.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  TODOS LOS DATOS DE ESTE ARCHIVO SON FICTICIOS
 *
 *  Nombres, DNI, CUIL, CBU/CVU, domicilios, teléfonos y correos fueron
 *  inventados para este seed. No corresponden a ninguna persona, cuenta ni
 *  domicilio real. Los CUIL y CBU pasan la validación de formato porque el
 *  dígito verificador se calculó a propósito, no porque existan.
 *
 *  Los parámetros normativos provienen de @casas/payroll-engine/fixtures y
 *  están marcados como datos de prueba, no oficiales.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Crea, según pide el encargo: una familia, una trabajadora, un contador, un
 * administrador, una relación laboral activa, un calendario, fichajes, un
 * período abierto, parámetros ficticios, una preliquidación, una tarea ARCA y
 * un pago manual.
 */

import { randomUUID } from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import {
  ALL_FIXTURE_PARAMETER_VERSIONS,
  FIXTURE_CATEGORY,
  FIXTURE_OVERTIME_KIND,
  FIXTURE_PARAMETERS_H1_2026,
  calculatePayroll,
  LiveInMode,
  PeriodType,
  RemunerationScheme,
} from '@casas/payroll-engine';

const prisma = new PrismaClient();

/** El seed no se ejecuta en producción: crearía datos ficticios en datos reales. */
function assertNotProduction(): void {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error(
      'El seed de demostración no puede ejecutarse con NODE_ENV=production: ' +
        'inserta datos ficticios que no deben convivir con datos reales.',
    );
  }
}

// ── Identificadores fijos, para que el seed sea idempotente ─────────────────
const ID = {
  userEmployer: '00000000-0000-4000-8000-000000000101',
  userWorker: '00000000-0000-4000-8000-000000000102',
  userAccountant: '00000000-0000-4000-8000-000000000103',
  userAdmin: '00000000-0000-4000-8000-000000000104',
  employer: '00000000-0000-4000-8000-000000000201',
  worker: '00000000-0000-4000-8000-000000000202',
  accountant: '00000000-0000-4000-8000-000000000203',
  firm: '00000000-0000-4000-8000-000000000204',
  household: '00000000-0000-4000-8000-000000000301',
  relationship: '00000000-0000-4000-8000-000000000401',
  terms: '00000000-0000-4000-8000-000000000402',
  schedule: '00000000-0000-4000-8000-000000000403',
  assignment: '00000000-0000-4000-8000-000000000404',
  bankAccount: '00000000-0000-4000-8000-000000000501',
  period: '00000000-0000-4000-8000-000000000601',
  payrollVersion: '00000000-0000-4000-8000-000000000602',
  calculation: '00000000-0000-4000-8000-000000000603',
  arcaTask: '00000000-0000-4000-8000-000000000701',
  payment: '00000000-0000-4000-8000-000000000801',
  plan: '00000000-0000-4000-8000-000000000901',
} as const;

async function main(): Promise<void> {
  assertNotProduction();
  console.warn('Sembrando datos de demostración. TODOS LOS DATOS SON FICTICIOS.\n');

  // ── 1. Usuarios ───────────────────────────────────────────────────────────
  // Los hashes son placeholders: el seed no crea contraseñas usables. El acceso
  // en desarrollo se obtiene por el flujo de código de un solo uso.
  const PLACEHOLDER_HASH = '$argon2id$v=19$m=65536,t=3,p=4$SEED_PLACEHOLDER_NO_USABLE';

  const users = [
    {
      id: ID.userEmployer,
      email: 'familia.demo@ejemplo-ficticio.test',
      displayName: 'Familia Demostración (ficticia)',
      role: 'FAMILY_EMPLOYER' as const,
    },
    {
      id: ID.userWorker,
      email: 'trabajadora.demo@ejemplo-ficticio.test',
      displayName: 'Trabajadora Demostración (ficticia)',
      role: 'WORKER' as const,
    },
    {
      id: ID.userAccountant,
      email: 'contador.demo@ejemplo-ficticio.test',
      displayName: 'Contador Demostración (ficticio)',
      role: 'ACCOUNTANT' as const,
    },
    {
      id: ID.userAdmin,
      email: 'admin.demo@ejemplo-ficticio.test',
      displayName: 'Administrador Demostración (ficticio)',
      role: 'PLATFORM_ADMIN' as const,
    },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {},
      create: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        passwordHash: PLACEHOLDER_HASH,
        status: 'ACTIVE',
        emailVerifiedAt: new Date('2026-01-10T12:00:00Z'),
        // MFA queda habilitado para contador y administrador (SEG-02).
        mfaEnabled: user.role === 'ACCOUNTANT' || user.role === 'PLATFORM_ADMIN',
        roles: { create: { role: user.role } },
      },
    });
  }
  console.warn('  ✓ 4 usuarios (familia, trabajadora, contador, administrador)');

  // ── 2. Perfiles ───────────────────────────────────────────────────────────
  // CUIL ficticios. Se guarda el cifrado en producción; el seed usa un marcador
  // explícito para que nadie confunda esto con un valor cifrado real.
  await prisma.employer.upsert({
    where: { id: ID.employer },
    update: {},
    create: {
      id: ID.employer,
      userId: ID.userEmployer,
      firstName: 'Familia',
      lastName: 'Demostración (ficticia)',
      legalName: 'Familia Demostración (ficticia)',
      cuilCipher: 'SEED_PLACEHOLDER_NO_CIFRADO_REAL',
      cuilKeyId: 'seed-key',
      cuilLast4: '0017',
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date('2026-01-11T12:00:00Z'),
      verificationProvider: 'REVISION_INTERNA_DEMO',
    },
  });

  await prisma.worker.upsert({
    where: { id: ID.worker },
    update: {},
    create: {
      id: ID.worker,
      userId: ID.userWorker,
      firstName: 'Trabajadora',
      lastName: 'Demostración (ficticia)',
      legalName: 'Trabajadora Demostración (ficticia)',
      cuilCipher: 'SEED_PLACEHOLDER_NO_CIFRADO_REAL',
      cuilKeyId: 'seed-key',
      cuilLast4: '0028',
      birthDate: new Date('1990-04-12'),
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date('2026-01-12T12:00:00Z'),
      verificationProvider: 'REVISION_INTERNA_DEMO',
    },
  });

  await prisma.accountingFirm.upsert({
    where: { id: ID.firm },
    update: {},
    create: {
      id: ID.firm,
      name: 'Estudio Contable Demostración (ficticio)',
      jurisdiction: 'CORDOBA',
    },
  });

  await prisma.accountant.upsert({
    where: { id: ID.accountant },
    update: {},
    create: {
      id: ID.accountant,
      userId: ID.userAccountant,
      accountingFirmId: ID.firm,
      legalName: 'Contador Demostración (ficticio)',
      licenseNumber: 'DEMO-00000-F',
      jurisdiction: 'CORDOBA',
      licenseStatus: 'ACTIVE',
      licenseValidUntil: new Date('2027-12-31'),
      licenseVerifiedAt: new Date('2026-01-05T12:00:00Z'),
      capacity: 50,
    },
  });
  console.warn('  ✓ Perfiles de familia, trabajadora y contador (matrícula ficticia)');

  // ── 3. Cuenta bancaria de la trabajadora ─────────────────────────────────
  // CBU ficticio con dígito verificador válido: existe para probar la validación
  // de formato, no corresponde a ninguna cuenta.
  await prisma.workerBankAccount.upsert({
    where: { id: ID.bankAccount },
    update: {},
    create: {
      id: ID.bankAccount,
      workerId: ID.worker,
      kind: 'CBU',
      numberCipher: 'SEED_PLACEHOLDER_NO_CIFRADO_REAL',
      numberKeyId: 'seed-key',
      last4: '5201',
      alias: 'demo.ficticia.cuenta',
      isPrimary: true,
      confirmedAt: new Date('2026-01-15T12:00:00Z'),
      confirmedByUserId: ID.userEmployer,
    },
  });

  // ── 4. Domicilio laboral ──────────────────────────────────────────────────
  await prisma.household.upsert({
    where: { id: ID.household },
    update: {},
    create: {
      id: ID.household,
      employerId: ID.employer,
      label: 'Casa (demostración)',
      street: 'Calle Ficticia',
      streetNumber: '1234',
      country: 'AR',
      city: 'Córdoba',
      province: 'Córdoba',
      postalCode: 'X5000',
      timezone: 'America/Argentina/Cordoba',
      geoLat: new Prisma.Decimal('-31.420000'),
      geoLng: new Prisma.Decimal('-64.190000'),
      geoRadiusMeters: 150,
    },
  });

  // ── 5. Categorías del catálogo (ficticias) ────────────────────────────────
  for (const [code, label] of [
    [FIXTURE_CATEGORY.GENERAL_TASKS, 'Tareas generales (categoría de prueba A)'],
    [FIXTURE_CATEGORY.CHILD_CARE, 'Cuidado de personas (categoría de prueba B)'],
  ] as const) {
    await prisma.workerCategory.upsert({
      where: { code },
      update: {},
      create: {
        code,
        label,
        description:
          'Categoría ficticia. El catálogo real lo carga un contador matriculado (OD-19).',
        isFixture: true,
      },
    });
  }

  // ── 6. Parámetros normativos ficticios ────────────────────────────────────
  for (const version of ALL_FIXTURE_PARAMETER_VERSIONS) {
    await prisma.payrollParameterVersion.upsert({
      where: { id: version.id },
      update: {},
      create: {
        id: version.id,
        label: version.source,
        status: 'PUBLISHED',
        source: version.source,
        isFixture: true,
        effectiveFrom: new Date(version.effectiveFrom),
        effectiveTo: version.effectiveTo === null ? null : new Date(version.effectiveTo),
        currency: version.currency,
        payload: version as unknown as Prisma.InputJsonValue,
        preparedByUserId: ID.userAdmin,
        // Doble control: preparador ≠ aprobador (CON-11). En el seed son dos
        // usuarios distintos para que la invariante se cumpla también acá.
        approvedByUserId: ID.userAccountant,
        publishedAt: version.publishedAt === null ? null : new Date(version.publishedAt),
      },
    });
  }
  console.warn('  ✓ 2 versiones de parámetros FICTICIAS, marcadas como no oficiales');

  // ── 7. Relación laboral activa ────────────────────────────────────────────
  await prisma.employmentRelationship.upsert({
    where: { id: ID.relationship },
    update: {},
    create: {
      id: ID.relationship,
      employerId: ID.employer,
      workerId: ID.worker,
      householdId: ID.household,
      status: 'ACTIVE',
      startDate: new Date('2024-03-01'),
      workerAcceptedAt: new Date('2026-01-16T10:00:00Z'),
      workerAcceptanceEvidence: {
        termsVersion: '1.0',
        acceptedFrom: 'demo-seed',
        note: 'Aceptación simulada por el seed de demostración.',
      },
      createdByUserId: ID.userEmployer,
    },
  });

  await prisma.relationshipTerms.upsert({
    where: { id: ID.terms },
    update: {},
    create: {
      id: ID.terms,
      employmentRelationshipId: ID.relationship,
      effectiveFrom: new Date('2024-03-01'),
      effectiveTo: null,
      categoryCode: FIXTURE_CATEGORY.GENERAL_TASKS,
      liveInMode: 'WITH_WITHDRAWAL',
      remunerationScheme: 'MONTHLY',
      agreedRemuneration: new Prisma.Decimal('400000.00'),
      weeklyHours: 30,
      createdByUserId: ID.userEmployer,
    },
  });

  // ── 8. Calendario semanal: lunes a viernes, 09:00 a 15:00 ────────────────
  await prisma.workSchedule.upsert({
    where: { id: ID.schedule },
    update: {},
    create: {
      id: ID.schedule,
      employmentRelationshipId: ID.relationship,
      status: 'PUBLISHED',
      effectiveFrom: new Date('2024-03-01'),
      allowedMethods: ['BUTTON', 'QR', 'PIN'],
      defaultMethod: 'QR',
      roundingMinutes: 5,
      toleranceMinutes: 10,
      createdByUserId: ID.userEmployer,
      rules: {
        create: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
          dayOfWeek,
          startMinute: 9 * 60,
          endMinute: 15 * 60,
          breakMinutes: 0,
        })),
      },
    },
  });
  console.warn('  ✓ Relación laboral activa con calendario semanal (lun-vie 09:00-15:00)');

  // ── 9. Asignación profesional ─────────────────────────────────────────────
  await prisma.professionalAssignment.upsert({
    where: { id: ID.assignment },
    update: {},
    create: {
      id: ID.assignment,
      accountantId: ID.accountant,
      employmentRelationshipId: ID.relationship,
      status: 'ACTIVE',
      scope: 'Revisión técnica de la preliquidación y asistencia en el flujo de ARCA.',
      acceptedByEmployerAt: new Date('2026-01-20T12:00:00Z'),
      acceptedByAccountantAt: new Date('2026-01-20T15:00:00Z'),
      createdByUserId: ID.userEmployer,
    },
  });

  // ── 10. Período abierto de mayo 2026, con fichajes ───────────────────────
  await prisma.payrollPeriod.upsert({
    where: { id: ID.period },
    update: {},
    create: {
      id: ID.period,
      employmentRelationshipId: ID.relationship,
      year: 2026,
      month: 5,
      periodType: 'MONTHLY',
      status: 'OPEN',
      fromDate: new Date('2026-05-01'),
      toDate: new Date('2026-05-31'),
      createdByUserId: ID.userEmployer,
    },
  });

  // Jornadas hábiles de mayo 2026, 6 horas cada una.
  const workDays: { date: string; minutes: number }[] = [];
  for (let day = 1; day <= 31; day += 1) {
    const date = new Date(Date.UTC(2026, 4, day));
    const dayOfWeek = date.getUTCDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;
    workDays.push({ date: date.toISOString().slice(0, 10), minutes: 360 });
  }

  for (const { date, minutes } of workDays) {
    const workDayId = randomUUID();
    await prisma.workDay.upsert({
      where: {
        employmentRelationshipId_date: {
          employmentRelationshipId: ID.relationship,
          date: new Date(date),
        },
      },
      update: {},
      create: {
        id: workDayId,
        employmentRelationshipId: ID.relationship,
        payrollPeriodId: ID.period,
        date: new Date(date),
        status: 'APPROVED',
        // RN-04: reales y computables se guardan por separado. Acá coinciden
        // porque el fichaje fue puntual; la diferencia aparece con redondeo.
        realMinutes: minutes,
        computableMinutes: minutes,
        appliedRoundingRule: 'redondeo 5 min, tolerancia 10 min',
        approvedAt: new Date('2026-06-01T10:00:00Z'),
        approvedByUserId: ID.userEmployer,
        createdByUserId: ID.userWorker,
        timeEntries: {
          create: [
            {
              kind: 'CLOCK_IN',
              status: 'APPROVED',
              declaredAt: new Date(`${date}T12:00:00Z`),
              receivedAt: new Date(`${date}T12:00:03Z`),
              timezone: 'America/Argentina/Cordoba',
              method: 'QR',
              deviceLabel: 'Dispositivo de demostración',
              clientIdempotencyKey: `seed-in-${date}`,
              employmentRelationshipId: ID.relationship,
              createdByUserId: ID.userWorker,
            },
            {
              kind: 'CLOCK_OUT',
              status: 'APPROVED',
              declaredAt: new Date(`${date}T18:00:00Z`),
              receivedAt: new Date(`${date}T18:00:04Z`),
              timezone: 'America/Argentina/Cordoba',
              method: 'QR',
              deviceLabel: 'Dispositivo de demostración',
              clientIdempotencyKey: `seed-out-${date}`,
              employmentRelationshipId: ID.relationship,
              createdByUserId: ID.userWorker,
            },
          ],
        },
      },
    });
  }
  console.warn(`  ✓ ${workDays.length} jornadas con fichaje de entrada y salida (mayo 2026)`);

  // ── 11. Preliquidación con parámetros ficticios ──────────────────────────
  const totalMinutes = workDays.reduce((sum, d) => sum + d.minutes, 0);

  const result = calculatePayroll({
    employmentRelationshipId: ID.relationship,
    payrollPeriodId: ID.period,
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
    normalMinutes: totalMinutes,
    overtime: [{ kindCode: FIXTURE_OVERTIME_KIND.WEEKDAY, minutes: 120 }],
    holidayMinutes: 0,
    relationshipStartDate: '2024-03-01',
    unfavorableZoneCode: null,
    events: [],
    annualBonus: { applies: false, bestSemesterRemuneration: '0', monthsWorkedInSemester: 0 },
    additionalConcepts: [],
  });

  await prisma.payrollVersion.upsert({
    where: { id: ID.payrollVersion },
    update: {},
    create: {
      id: ID.payrollVersion,
      payrollPeriodId: ID.period,
      versionNumber: 1,
      isCurrent: true,
      createdByUserId: ID.userEmployer,
    },
  });

  await prisma.payrollCalculation.upsert({
    where: { id: ID.calculation },
    update: {},
    create: {
      id: ID.calculation,
      payrollVersionId: ID.payrollVersion,
      payrollParameterVersionId: FIXTURE_PARAMETERS_H1_2026.id,
      engineVersion: result.engineVersion,
      grossEstimate: new Prisma.Decimal(result.grossEstimate),
      deductionsEstimate: new Prisma.Decimal(result.deductionsEstimate),
      netEstimate: new Prisma.Decimal(result.netEstimate),
      usedFixtureParameters: result.usedFixtureParameters,
      warnings: result.warnings as unknown as Prisma.InputJsonValue,
      blockingErrors: result.blockingErrors as unknown as Prisma.InputJsonValue,
      trace: result.trace as unknown as Prisma.InputJsonValue,
      estimatedObligations: result.estimatedObligations as unknown as Prisma.InputJsonValue,
      calculatedByUserId: ID.userEmployer,
      lineItems: {
        create: result.lineItems.map((line, index) => ({
          ordinal: index + 1,
          code: line.code,
          label: line.label,
          sign: line.sign,
          calculationBase: new Prisma.Decimal(line.calculationBase),
          quantity: line.quantity === null ? null : new Prisma.Decimal(line.quantity),
          rate: line.rate,
          amount: new Prisma.Decimal(line.amount),
          formulaId: line.formulaId,
          formulaExplanation: line.formulaExplanation,
          parameterRef: line.parameterRef,
        })),
      },
    },
  });
  console.warn(
    `  ✓ Preliquidación: bruto ${result.grossEstimate}, neto ${result.netEstimate} ` +
      '(CON PARÁMETROS FICTICIOS)',
  );

  // ── 12. Enlaces oficiales como contenido administrable (ADM-07) ──────────
  for (const content of [
    {
      key: 'arca.casas_particulares.home',
      label: 'ARCA — Casas Particulares',
      value: 'https://www.arca.gob.ar/casasparticulares/',
    },
    {
      key: 'arca.recibo_digital',
      label: 'ARCA — Recibo de sueldo digital',
      value: 'https://www.arca.gob.ar/casasparticulares/',
    },
    {
      key: 'arca.administrador_relaciones',
      label: 'ARCA — Administrador de Relaciones',
      value: 'https://www.arca.gob.ar/',
    },
  ]) {
    await prisma.managedContent.upsert({
      where: { key: content.key },
      update: {},
      create: {
        ...content,
        contentType: 'URL',
        source: 'Enlace a revisar antes de cada publicación (sección 20 del documento).',
        ownerUserId: ID.userAdmin,
        createdByUserId: ID.userAdmin,
      },
    });
  }

  // ── 13. Tarea ARCA asistida ───────────────────────────────────────────────
  await prisma.aRCATask.upsert({
    where: { id: ID.arcaTask },
    update: {},
    create: {
      id: ID.arcaTask,
      employmentRelationshipId: ID.relationship,
      payrollPeriodId: ID.period,
      type: 'RECEIPT_ISSUANCE',
      status: 'PENDING',
      assigneeRole: 'FAMILY_EMPLOYER',
      assigneeUserId: ID.userEmployer,
      dueDate: new Date('2026-06-10'),
      officialLinkKey: 'arca.recibo_digital',
      preparedValues: result.lineItems.slice(0, 5).map((line) => ({
        fieldKey: line.code,
        officialLabel: line.label,
        value: line.amount,
        kind: 'MONEY',
      })) as unknown as Prisma.InputJsonValue,
      createdByUserId: ID.userEmployer,
      checklistItems: {
        create: [
          {
            ordinal: 1,
            label: 'Ingresar a ARCA con tu propia clave fiscal',
            helpText:
              'El enlace abre el sitio oficial en tu navegador. La aplicación nunca te pide la clave fiscal.',
          },
          {
            ordinal: 2,
            label: 'Seleccionar el servicio de Casas Particulares',
            helpText: 'Verificá que el dominio del sitio sea el oficial antes de ingresar datos.',
          },
          {
            ordinal: 3,
            label: 'Cargar los valores del período',
            helpText:
              'Los importes calculados están disponibles para copiar en la pantalla anterior.',
          },
          {
            ordinal: 4,
            label: 'Emitir el recibo en ARCA',
            helpText: 'El recibo oficial se genera en ARCA. Esta aplicación no lo emite.',
          },
          {
            ordinal: 5,
            label: 'Importar el PDF del recibo en la aplicación',
            helpText: 'Se compara contra la preliquidación y se registran las diferencias.',
          },
        ],
      },
    },
  });
  console.warn('  ✓ Tarea ARCA asistida con checklist de 5 pasos');

  // ── 14. Plan, suscripción y pago manual ───────────────────────────────────
  await prisma.plan.upsert({
    where: { id: ID.plan },
    update: {},
    create: {
      id: ID.plan,
      code: 'DEMO_ADMINISTRACION',
      label: 'Administración completa (plan de demostración)',
      includesProfessionalReview: true,
      monthlyPrice: new Prisma.Decimal('0.00'),
      active: true,
    },
  });

  await prisma.subscription.upsert({
    where: { id: '00000000-0000-4000-8000-000000000902' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000902',
      employerId: ID.employer,
      planId: ID.plan,
      status: 'TRIAL',
      priceSnapshot: new Prisma.Decimal('0.00'),
      createdByUserId: ID.userAdmin,
    },
  });

  // Pago manual: transferencia directa familia → trabajadora. El dinero nunca
  // pasa por la plataforma (principios 3 y 4).
  await prisma.payment.upsert({
    where: { id: ID.payment },
    update: {},
    create: {
      id: ID.payment,
      employmentRelationshipId: ID.relationship,
      payrollPeriodId: ID.period,
      payrollVersionId: ID.payrollVersion,
      workerBankAccountId: ID.bankAccount,
      status: 'REGISTERED',
      method: 'MANUAL_TRANSFER',
      amount: new Prisma.Decimal(result.netEstimate),
      paidAt: new Date('2026-06-05T14:00:00Z'),
      externalReference: 'DEMO-TRANSFER-000001',
      idempotencyKey: 'seed-payment-2026-05',
      registeredByUserId: ID.userEmployer,
      createdByUserId: ID.userEmployer,
    },
  });
  console.warn('  ✓ Pago manual registrado (transferencia directa, ficticia)');

  // ── 15. Auditoría del propio seed ─────────────────────────────────────────
  await prisma.auditEvent.create({
    data: {
      actorUserId: ID.userAdmin,
      actorRole: 'SYSTEM',
      action: 'DEMO_SEED_EXECUTED',
      entityType: 'System',
      entityId: 'seed',
      after: {
        note: 'Seed de demostración ejecutado. Todos los datos son ficticios.',
        parameterVersions: ALL_FIXTURE_PARAMETER_VERSIONS.map((v) => v.id),
      },
    },
  });

  console.warn('\n════════════════════════════════════════════════════════════');
  console.warn('  Seed completo. RECORDATORIO:');
  console.warn('  · Todos los datos personales y bancarios son FICTICIOS.');
  console.warn('  · Los parámetros de liquidación son FIXTURES, NO OFICIALES.');
  console.warn('  · Ningún importe de esta base representa una liquidación válida.');
  console.warn('════════════════════════════════════════════════════════════\n');
}

main()
  .catch((error: unknown) => {
    console.error('El seed falló:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
