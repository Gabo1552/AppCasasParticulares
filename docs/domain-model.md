# Modelo de dominio

> Deriva de `docs/Requerimientos_Plataforma_Casas_Particulares_Argentina_v1.docx`, sección 10 (Modelo de
> datos), sección 8 (Reglas de negocio) y sección 7 (Requerimientos funcionales).
> Complementa `docs/architecture.md` (cómo se implementa) y `docs/security-model.md` (quién puede qué).

## 1. Lenguaje ubicuo

El dominio es argentino y el vocabulario legal es castellano. El código usa **inglés para identificadores**
(consistencia con el ecosistema TypeScript) y mantiene una tabla de correspondencia explícita para que
no haya ambigüedad entre lo que dice la ley y lo que dice el código.

| Término del dominio (es-AR)       | Identificador en código                                 | Definición operativa                                                                |
| --------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Familia empleadora                | `Employer`                                              | Persona humana o grupo familiar que emplea. Titular de la relación.                 |
| Trabajadora de casas particulares | `Worker`                                                | Persona empleada bajo el régimen de casas particulares.                             |
| Contador matriculado              | `Accountant`                                            | Profesional de ciencias económicas con matrícula vigente en una jurisdicción.       |
| Domicilio laboral                 | `Household`                                             | Lugar físico donde se presta el trabajo. Una familia puede tener varios.            |
| Relación laboral                  | `EmploymentRelationship`                                | Vínculo entre `Employer` y `Worker` en un `Household`, con condiciones versionadas. |
| Categoría                         | `WorkerCategory`                                        | Categoría legal de tareas (catálogo administrable, no hardcodeado).                 |
| Modalidad con/sin retiro          | `LiveInMode` (`WITH_WITHDRAWAL` / `WITHOUT_WITHDRAWAL`) | Si la trabajadora reside o no en el domicilio.                                      |
| Esquema mensual / por hora        | `RemunerationScheme` (`MONTHLY` / `HOURLY`)             | Base de cálculo de la remuneración pactada.                                         |
| Horario previsto                  | `WorkSchedule`                                          | Reglas semanales + excepciones que generan jornadas esperadas.                      |
| Jornada esperada                  | `ExpectedShift`                                         | Instancia concreta derivada del `WorkSchedule` para una fecha.                      |
| Fichaje                           | `TimeEntry`                                             | Marca de entrada o salida.                                                          |
| Jornada                           | `WorkDay`                                               | Agregación de fichajes de una fecha: horas reales y horas computables.              |
| Corrección de fichaje             | `AttendanceCorrection`                                  | Solicitud de ajuste que **nunca borra** el original.                                |
| Novedad                           | `EmploymentEvent`                                       | Ausencia, licencia, feriado, adelanto, vacaciones u otro hecho del período.         |
| Parámetro normativo               | `PayrollParameterVersion`                               | Conjunto inmutable de escalas y reglas con vigencia y fuente.                       |
| Período de liquidación            | `PayrollPeriod`                                         | Mes calendario (o período extraordinario) de una relación laboral.                  |
| Preliquidación                    | `PayrollCalculation`                                    | Resultado del motor. No es un recibo.                                               |
| Concepto liquidado                | `PayrollLineItem`                                       | Línea de la preliquidación con fórmula, base, cantidad, tasa e importe.             |
| Rectificativa                     | `PayrollVersion` (n > 1)                                | Nueva versión encadenada a la anterior, con motivo.                                 |
| Tarea ARCA                        | `ARCATask`                                              | Unidad de trabajo del flujo asistido, con checklist y vencimiento.                  |
| Recibo oficial                    | `ARCADocument`                                          | PDF emitido por ARCA, importado y validado.                                         |
| Pago                              | `Payment`                                               | Transferencia directa familia → trabajadora.                                        |
| Conciliación                      | `Reconciliation`                                        | Comparación preliquidación / recibo oficial / pago y sus diferencias.               |
| Consentimiento                    | `Consent`                                               | Aceptación versionada de un texto con finalidad declarada.                          |
| Auditoría                         | `AuditEvent`                                            | Registro append-only de una operación sensible.                                     |

## 2. Contextos delimitados (bounded contexts)

El sistema es un **monolito modular**. Los contextos son límites de código y de datos, no procesos separados.
La regla: un contexto no lee tablas de otro; consume su interfaz pública (servicio de aplicación) o
reacciona a sus eventos de dominio.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              PLATAFORMA (monolito modular)                    │
│                                                                               │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────────┐  │
│  │  IDENTITY & ACCESS │  │      PARTIES       │  │   WORK RELATIONSHIP    │  │
│  │  Identity          │  │  Users             │  │  Households            │  │
│  │  Audit             │  │  Employers         │  │  EmploymentRelationships│ │
│  │  (consents)        │  │  Workers           │  │  WorkSchedules         │  │
│  │                    │  │  Accountants       │  │                        │  │
│  │                    │  │  ProfessionalAssig.│  │                        │  │
│  └────────────────────┘  └────────────────────┘  └───────────┬────────────┘  │
│                                                               │               │
│  ┌────────────────────────────────────┐          ┌────────────▼────────────┐ │
│  │            TIME & EVENTS           │          │        PAYROLL          │ │
│  │  TimeTracking                      │─────────▶│  PayrollParameters      │ │
│  │  AttendanceCorrections             │          │  PayrollPeriods         │ │
│  │  EmploymentEvents                  │          │  PayrollCalculations    │ │
│  └────────────────────────────────────┘          │  PayrollVersions        │ │
│                                                  └────────────┬────────────┘ │
│                                                               │              │
│  ┌───────────────────────┐  ┌──────────────────┐  ┌───────────▼───────────┐ │
│  │      COMPLIANCE       │  │     SETTLEMENT   │  │      SUPPORTING       │ │
│  │  ARCATasks            │  │  Payments        │  │  Documents            │ │
│  │  ARCADocuments        │  │  Reconciliation  │  │  Notifications        │ │
│  │                       │  │                  │  │  Subscriptions        │ │
│  │                       │  │                  │  │  Administration       │ │
│  │                       │  │                  │  │  Support              │ │
│  └───────────────────────┘  └──────────────────┘  └───────────────────────┘ │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  FUTURO (feature flag, sin código simulado): Marketplace, Matching, Chat │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Dirección de dependencias permitida

```
Payroll ──lee──▶ Time & Events, Work Relationship, PayrollParameters
Compliance ──lee──▶ Payroll (período aprobado)
Settlement ──lee──▶ Payroll, Compliance
Supporting ──lee──▶ cualquiera (a través de interfaces)
Identity/Audit ◀──escribe── todos
```

**Prohibido**: que `payroll-engine` dependa de HTTP, Prisma, Nest o de cualquier contexto. Es una librería pura.

## 3. Agregados y sus invariantes

Un agregado es la unidad de consistencia transaccional. Las invariantes listadas se verifican **dentro
de la transacción** que modifica el agregado.

### 3.1 `EmploymentRelationship` (raíz)

Contiene: condiciones versionadas (`RelationshipTerms`), vínculo a `Household`, `Employer` y `Worker`.

Invariantes:

- **INV-REL-01** — Una relación siempre tiene exactamente un `Employer`, un `Worker` y un `Household`.
- **INV-REL-02** — Las condiciones (categoría, modalidad, esquema, remuneración) se guardan como
  `RelationshipTerms` con `effectiveFrom` / `effectiveTo`. **Nunca se sobrescribe** un `RelationshipTerms`
  referenciado por una liquidación cerrada (REL-05, RN-02).
- **INV-REL-03** — Los rangos de vigencia de `RelationshipTerms` de una relación no se solapan y no dejan huecos.
- **INV-REL-04** — La transición a `ACTIVE` exige: worker aceptó, terms vigentes completos, `WorkSchedule` publicado.
- **INV-REL-05** — No se admite borrado físico (`deletedAt` nulo siempre; sólo `ARCHIVED`).

### 3.2 `WorkDay` (raíz) y `TimeEntry`

Un `WorkDay` agrupa los `TimeEntry` de una fecha para una relación.

Invariantes:

- **INV-TIME-01** — `realMinutes` y `computableMinutes` son campos distintos y ambos persisten (RN-04).
- **INV-TIME-02** — El sistema **nunca genera** un `TimeEntry` que el usuario no registró (RN-03). Una
  jornada esperada sin fichaje produce una **alerta**, no un dato.
- **INV-TIME-03** — `clientIdempotencyKey` es único por `(employmentRelationshipId, clientIdempotencyKey)`.
  Un reenvío offline no crea un duplicado.
- **INV-TIME-04** — Una corrección crea un `TimeEntry` nuevo en estado `CORRECTED` y marca el original;
  el original **nunca se borra ni se edita** (FIC-06).
- **INV-TIME-05** — Un `WorkDay` dentro de un período con estado ≥ `READY_FOR_CALCULATION` está bloqueado;
  modificarlo exige reapertura auditada (FIC-07).

### 3.3 `PayrollPeriod` (raíz)

Contiene: estado, versiones de liquidación (`PayrollVersion`), aprobaciones.

Invariantes:

- **INV-PAY-01** — Una `(employmentRelationshipId, year, month, periodType)` es única.
- **INV-PAY-02** — Todo `PayrollCalculation` referencia un `payrollParameterVersionId` **inmutable**;
  recalcular un período histórico usa exactamente esa versión (RN-02, LIQ-02).
- **INV-PAY-03** — Una vez `CLOSED`, ningún campo de la versión cambia. Una diferencia posterior crea
  una **nueva** `PayrollVersion` con `supersedesVersionId` y `rectificationReason` (RN-06, LIQ-13).
- **INV-PAY-04** — El período no avanza a `APPROVED` si el cálculo devolvió `blockingErrors` no resueltos
  (RN-07, LIQ-10).
- **INV-PAY-05** — El total neto y las obligaciones se persisten como `Decimal`, nunca como `float` (RN-13).

### 3.4 `PayrollParameterVersion` (raíz, inmutable)

Invariantes:

- **INV-PARAM-01** — Publicada es inmutable. Un cambio crea una versión nueva (RN-01).
- **INV-PARAM-02** — Publicación requiere **doble control**: `preparedByUserId ≠ approvedByUserId` (CON-11, ADM-02).
- **INV-PARAM-03** — Tiene `source` obligatorio. Los fixtures llevan `source` con el prefijo
  `FIXTURE — DATO DE PRUEBA, NO OFICIAL` y no pueden pasar a `PUBLISHED` en el entorno `production`.
- **INV-PARAM-04** — `effectiveFrom` obligatorio; `effectiveTo` nulo significa vigente.

### 3.5 `Payment` (raíz)

Invariantes:

- **INV-PAGO-01** — El destino es **siempre** una cuenta de la trabajadora. No existe cuenta de plataforma
  como destino de salario (principio 3 y 4, PAG-02).
- **INV-PAGO-02** — `idempotencyKey` único; un reintento no genera un segundo pago (PAG-07).
- **INV-PAGO-03** — CBU/CVU se almacenan cifrados a nivel de aplicación y **sólo se exponen enmascarados**
  (últimos 4 dígitos). Nunca en logs (13.1).
- **INV-PAGO-04** — Un cambio de CBU/CVU genera evento de auditoría, notificación y exige confirmación
  reforzada antes del primer pago (RN-10).
- **INV-PAGO-05** — Salario, suscripción y honorarios profesionales son entidades y flujos **separados** (RN-09).

### 3.6 `ARCADocument` y `Reconciliation`

Invariantes:

- **INV-ARCA-01** — La plataforma nunca genera un recibo. `ARCADocument` sólo se crea por importación (principio 7).
- **INV-ARCA-02** — Un `ARCADocument` importado calcula y persiste `sha256` del archivo (DOC-03).
- **INV-ARCA-03** — La `Reconciliation` no puede marcarse `RECONCILED` con diferencias abiertas (ARC-07, PAG-06).
- **INV-ARCA-04** — No existe ningún campo, DTO ni log que reciba clave fiscal (SEG-06, principio 5).

### 3.7 `AuditEvent` (append-only)

Invariantes:

- **INV-AUD-01** — Sólo `INSERT`. Sin `UPDATE` ni `DELETE` (revocado a nivel de rol de base de datos).
- **INV-AUD-02** — No contiene secretos, credenciales, CBU/CVU completo ni contenido de documentos.
- **INV-AUD-03** — Cuando la operación de negocio es crítica, el `AuditEvent` se escribe en la **misma
  transacción**; si el consumidor es externo, se usa el patrón outbox (14.1).

## 4. Máquinas de estado

Las transiciones se implementan como funciones puras en `packages/domain` (`canTransition`,
`assertTransition`) y se invocan desde servicios de dominio. **No existe un endpoint que asigne un estado
arbitrario.**

### 4.1 `EmploymentRelationship`

```
                    ┌──────────────────────────┐
   DRAFT ──invite──▶ PENDING_WORKER_ACCEPTANCE │
     │                          │              │
     │                     accept              │ reject / expire
     │                          ▼              ▼
     │              PENDING_CONFIGURATION ──▶ (vuelve a DRAFT)
     │                          │
     │                    configure + publish schedule
     │                          ▼
     └──cancel──────────────▶ ACTIVE ◀────reactivate────┐
                             │  │  │                     │
                     suspend │  │  └──────────▶ SUSPENDED
                             ▼  │
                        SUSPENDED│
                                 │ terminate
                                 ▼
                            TERMINATED
                                 │ (sin períodos abiertos, legajo exportado)
                                 ▼
                             ARCHIVED
```

| Desde                       | Hacia                       | Actor                      | Guarda                                                 |
| --------------------------- | --------------------------- | -------------------------- | ------------------------------------------------------ |
| `DRAFT`                     | `PENDING_WORKER_ACCEPTANCE` | `FAMILY_EMPLOYER`          | Household y datos mínimos completos                    |
| `PENDING_WORKER_ACCEPTANCE` | `PENDING_CONFIGURATION`     | `WORKER`                   | Aceptación registrada con evidencia (REL-08)           |
| `PENDING_WORKER_ACCEPTANCE` | `DRAFT`                     | `WORKER` / sistema         | Rechazo o vencimiento de la invitación                 |
| `PENDING_CONFIGURATION`     | `ACTIVE`                    | `FAMILY_EMPLOYER`          | Terms vigentes + `WorkSchedule` publicado (INV-REL-04) |
| `ACTIVE`                    | `SUSPENDED`                 | `FAMILY_EMPLOYER`          | Motivo obligatorio                                     |
| `SUSPENDED`                 | `ACTIVE`                    | `FAMILY_EMPLOYER`          | —                                                      |
| `ACTIVE` \| `SUSPENDED`     | `TERMINATED`                | `FAMILY_EMPLOYER`          | Fecha, motivo, pendientes declarados (REL-07)          |
| `TERMINATED`                | `ARCHIVED`                  | `PLATFORM_ADMIN` / sistema | Sin períodos abiertos, legajo exportado                |
| `DRAFT`                     | `ARCHIVED`                  | `FAMILY_EMPLOYER`          | Cancelación antes de invitar                           |

Sin transiciones desde `ARCHIVED`. Sin borrado físico en ningún estado.

### 4.2 `PayrollPeriod`

```
OPEN
 │ closeAttendance
 ▼
PENDING_ATTENDANCE_APPROVAL
 │ approveAttendance (familia)
 ▼
READY_FOR_CALCULATION
 │ calculate (motor)                     ┌──────────────┐
 ▼                                        │              │
CALCULATED ──requiresReview?──▶ PENDING_PROFESSIONAL_REVIEW
 │  no                                    │        │
 │                              observe ──┘        │ approveReview
 │                                  ▼              │
 │                              OBSERVED ──resolve─┤
 │                                                 │
 └──approve (familia) ────────────▶ APPROVED ◀─────┘
                                       │ createARCATask
                                       ▼
                                  PENDING_ARCA
                                       │ importReceipt (+ validate)
                                       ▼
                             ARCA_DOCUMENT_IMPORTED
                                       │ (diferencias resueltas)
                                       ▼
                                PENDING_PAYMENT
                                       │ registerPayment
                                       ▼
                                      PAID
                                       │ reconcile (sin diferencias)
                                       ▼
                                  RECONCILED
                                       │ close
                                       ▼
                                    CLOSED
```

Rama de rectificación, disponible desde `ARCA_DOCUMENT_IMPORTED` en adelante y desde `CLOSED`:

```
(cualquier estado ≥ ARCA_DOCUMENT_IMPORTED) ──diferencia detectada──▶ RECTIFICATION_REQUIRED
                                                                            │
                                              crea nueva PayrollVersion (n+1)│
                                                                            ▼
                                                              READY_FOR_CALCULATION (versión n+1)
```

Reglas:

- La versión anterior **permanece inalterada** (RN-06, INV-PAY-03). `RECTIFICATION_REQUIRED` no reabre
  la versión cerrada: abre una nueva.
- `CALCULATED → PENDING_PROFESSIONAL_REVIEW` sólo si la relación tiene un `ProfessionalAssignment`
  activo con revisión incluida en el plan; si no, va directo a la aprobación de la familia.
- `OBSERVED → READY_FOR_CALCULATION` cuando la familia resuelve la observación con cambios de novedades
  o asistencia (requiere reapertura auditada de la asistencia).
- Ninguna transición hacia adelante ocurre con `blockingErrors` pendientes (INV-PAY-04).

### 4.3 `TimeEntry`

```
              (cliente offline)
PENDING_SYNC ──sync──▶ RECORDED
                          │
              ┌───────────┴───────────┐
   requiere aprobación          no requiere
              ▼                       │
      PENDING_APPROVAL ──approve──▶ APPROVED
              │  │                     │
       reject │  └──dispute──▶ DISPUTED│
              ▼                  │     │
          REJECTED               │     │ (trabajadora objeta)
                                 │     ▼
                                 └──▶ DISPUTED
                                       │ correction approved
                                       ▼
                                   CORRECTED
```

| Desde                                          | Hacia              | Actor                                                    |
| ---------------------------------------------- | ------------------ | -------------------------------------------------------- |
| `PENDING_SYNC`                                 | `RECORDED`         | sistema (sincronización, con idempotencia)               |
| `RECORDED`                                     | `PENDING_APPROVAL` | sistema (cierre de asistencia del período)               |
| `RECORDED` \| `PENDING_APPROVAL` \| `APPROVED` | `DISPUTED`         | `WORKER` o `FAMILY_EMPLOYER`                             |
| `PENDING_APPROVAL`                             | `APPROVED`         | `FAMILY_EMPLOYER`                                        |
| `PENDING_APPROVAL`                             | `REJECTED`         | `FAMILY_EMPLOYER` (motivo obligatorio)                   |
| `DISPUTED`                                     | `CORRECTED`        | `FAMILY_EMPLOYER` aprueba `AttendanceCorrection`         |
| `DISPUTED`                                     | `APPROVED`         | `FAMILY_EMPLOYER` rechaza la objeción (queda registrada) |

`CORRECTED` es terminal para ese registro: el fichaje corregido es un **registro nuevo** que apunta al
original mediante `correctsTimeEntryId` (INV-TIME-04).

## 5. Objetos de valor

| Valor           | Forma                                          | Regla                                                             |
| --------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| `Money`         | `{ amount: Decimal, currency: 'ARS' }`         | Nunca `number`. Redondeo explícito por concepto, documentado.     |
| `Minutes`       | entero no negativo                             | El tiempo se mide en minutos enteros, no en horas fraccionarias.  |
| `DateRange`     | `{ from: LocalDate, to: LocalDate \| null }`   | `to` nulo = vigente. Sin solapamientos por entidad.               |
| `PeriodKey`     | `{ year, month, type }`                        | Identifica el período. `type ∈ MONTHLY \| EXTRAORDINARY \| FINAL` |
| `CUIL`          | string validado (formato + dígito verificador) | Se valida el formato; los seeds usan valores ficticios.           |
| `MaskedAccount` | `{ last4, kind: CBU \| CVU, alias? }`          | Única representación admitida en respuestas y logs.               |
| `GeoPoint`      | `{ lat, lng, accuracyMeters }`                 | Sólo en `TimeEntry`, precisión mínima necesaria (FIC-09).         |
| `AuditActor`    | `{ userId, role, onBehalfOf? }`                | `onBehalfOf` para acceso administrativo excepcional.              |

## 6. Eventos de dominio

Publicados por el agregado, consumidos por otros contextos y por el outbox. Nombres en pasado.

| Evento                          | Emisor            | Consumidores                            |
| ------------------------------- | ----------------- | --------------------------------------- |
| `RelationshipInvited`           | Work Relationship | Notifications, Audit                    |
| `RelationshipAccepted`          | Work Relationship | Notifications, Audit                    |
| `RelationshipActivated`         | Work Relationship | Payroll (crea primer período), Audit    |
| `RelationshipTermsChanged`      | Work Relationship | Payroll, Notifications, Audit           |
| `TimeEntryRecorded`             | Time & Events     | Audit                                   |
| `AttendanceCorrectionRequested` | Time & Events     | Notifications, Audit                    |
| `AttendanceApproved`            | Time & Events     | Payroll, Audit                          |
| `PayrollPeriodOpened`           | Payroll           | Notifications                           |
| `PayrollCalculated`             | Payroll           | Notifications, Accountants queue, Audit |
| `PayrollObserved`               | Payroll           | Notifications, Audit                    |
| `PayrollApproved`               | Payroll           | Compliance (crea `ARCATask`), Audit     |
| `ARCATaskCreated`               | Compliance        | Notifications                           |
| `ARCADocumentImported`          | Compliance        | Reconciliation, Audit                   |
| `PaymentRegistered`             | Settlement        | Reconciliation, Notifications, Audit    |
| `PeriodReconciled`              | Settlement        | Payroll (cierre), Audit                 |
| `RectificationRequested`        | Payroll           | Compliance, Notifications, Audit        |
| `BankAccountChanged`            | Parties           | Notifications (alerta), Audit           |

## 7. Entrada y salida del motor de liquidación

El motor (`packages/payroll-engine`) es una función pura. Su contrato:

```
calculatePayroll(input: PayrollInput): PayrollResult
```

### Entrada (`PayrollInput`)

| Campo                | Origen                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `period`             | `PayrollPeriod` (año, mes, tipo, rango de fechas)                                          |
| `category`           | `RelationshipTerms.categoryCode`                                                           |
| `liveInMode`         | `RelationshipTerms` (`WITH_WITHDRAWAL` / `WITHOUT_WITHDRAWAL`)                             |
| `remunerationScheme` | `RelationshipTerms` (`MONTHLY` / `HOURLY`)                                                 |
| `agreedRemuneration` | `RelationshipTerms.agreedAmount` (`Money`)                                                 |
| `parameters`         | `PayrollParameterVersion` completa (escalas mínimas, adicionales, aportes, ART, redondeos) |
| `normalMinutes`      | Agregado de `WorkDay.computableMinutes`                                                    |
| `overtimeMinutes`    | Desglosado por tipo (común / al 100 % / nocturno según parámetro)                          |
| `holidayMinutes`     | Jornadas en feriado                                                                        |
| `seniorityStartDate` | `EmploymentRelationship.startDate`                                                         |
| `unfavorableZone`    | `Household.unfavorableZoneCode \| null`                                                    |
| `absences`           | `EmploymentEvent[]` de tipo ausencia                                                       |
| `leaves`             | `EmploymentEvent[]` de tipo licencia                                                       |
| `vacation`           | `EmploymentEvent[]` de tipo vacaciones                                                     |
| `annualBonus`        | Instrucción de aguinaldo con su base semestral                                             |
| `otherConcepts`      | Conceptos configurables del catálogo permitido (LIQ-09)                                    |

### Salida (`PayrollResult`)

| Campo                    | Contenido                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| `lineItems[]`            | `{ code, label, calculationBase, formulaId, formulaExplanation, quantity, rate, amount, sign }` |
| `netEstimate`            | `Money` — neto estimado, **no** un recibo                                                       |
| `estimatedObligations[]` | Aportes, contribuciones y ART estimados, por concepto                                           |
| `warnings[]`             | `{ code, message, context }` — no bloquean                                                      |
| `blockingErrors[]`       | `{ code, message, context }` — impiden avanzar (INV-PAY-04)                                     |
| `parameterVersionId`     | Versión normativa exacta usada (RN-02)                                                          |
| `trace[]`                | Traza paso a paso: entrada → regla → resultado intermedio → redondeo                            |
| `engineVersion`          | Versión del motor, para reproducibilidad                                                        |

**Determinismo**: la misma entrada produce byte a byte el mismo resultado. Es requisito de la prueba de
idempotencia y del recálculo histórico.

## 8. Datos de demostración (seeds)

Los seeds crean, **todo ficticio**: una familia, una trabajadora, un contador, un administrador, una
relación laboral activa, un `WorkSchedule` semanal, fichajes de un mes, un `PayrollPeriod` abierto,
una `PayrollParameterVersion` de fixtures, una preliquidación, una `ARCATask` y un `Payment` manual.

Reglas de los seeds:

- CUIL, DNI, CBU/CVU, nombres y domicilios **generados y marcados como ficticios**.
- Los parámetros normativos llevan `source = "FIXTURE — DATO DE PRUEBA, NO OFICIAL"`.
- El seed se niega a ejecutarse si `NODE_ENV === 'production'`.
