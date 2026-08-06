# Resumen de producto

> Fuente: `docs/Requerimientos_Plataforma_Casas_Particulares_Argentina_v1.docx` (v1.0, 5 de agosto de 2026).
> Extracción textual completa en `docs/requirements-extract.md`.
> Este documento resume e interpreta el requerimiento. **No reemplaza dictamen legal, contable ni de privacidad.**

## 1. Qué es el producto

Plataforma web y móvil para administrar el ciclo de vida de una **relación laboral de casas particulares
ya existente** en Argentina: fichaje → novedades → cierre mensual → preliquidación → revisión profesional
opcional → gestión asistida en ARCA → importación y conciliación del recibo oficial → pago directo →
archivo documental y auditoría.

La propuesta de valor declarada en el documento es:

> "Encontrá o incorporá a tu trabajadora, registrá las horas, calculá correctamente el sueldo y dejá
> ARCA administrada, con trazabilidad para ambas partes."

**El marketplace no forma parte de la primera versión.** El documento (sección 16, Fase 0 / MVP) lo ubica
en la versión 1.2, después de validar fichaje, liquidación, administración contable y disposición a pagar.
En este repositorio el marketplace queda como módulo futuro detrás de feature flag, sin código simulado.

### Ámbito

| Campo | Valor |
| --- | --- |
| País | Argentina |
| Lanzamiento recomendado | Córdoba (a confirmar — ver `docs/open-decisions.md`, OD-01) |
| Idioma | Español de Argentina |
| Moneda | ARS, con decimal exacto |
| Zona horaria | Por domicilio laboral (NFR-08) |

## 2. Los cuatro actores y qué hace cada uno

| Actor | Rol técnico | Responsabilidad |
| --- | --- | --- |
| Familia empleadora | `FAMILY_EMPLOYER` | Es la empleadora. Configura la relación, aprueba jornadas, novedades, liquidación y pago. Opera o delega ARCA. |
| Trabajadora / niñera | `WORKER` | Ficha entrada y salida, revisa horas, solicita correcciones, consulta liquidaciones, recibos y pagos. Acceso gratuito. |
| Contador matriculado | `ACCOUNTANT` / `ACCOUNTANT_MANAGER` | Revisa cálculos, administra tareas autorizadas **con su propia clave fiscal**, deja observaciones, aprueba o devuelve. |
| Personal interno | `OPERATIONS_AGENT` / `PLATFORM_ADMIN` / `SUPPORT_AGENT` | Administra parámetros normativos, usuarios, incidentes y soporte. No modifica liquidaciones cerradas sin flujo autorizado. |

El documento menciona además dos roles que el prompt de implementación no enumeró: **Verificador**
(marketplace, fuera del MVP) y **Auditor / cumplimiento** (lectura de auditoría). Ver `docs/open-decisions.md`, OD-13.

## 3. Los principios que condicionan el diseño

Estos no son preferencias de estilo: son restricciones de arquitectura. Cada uno se traduce en una
decisión técnica concreta y verificable.

| # | Principio | Traducción técnica |
| --- | --- | --- |
| 1 | La familia es siempre la empleadora | No existe entidad "plataforma como empleadora". Toda decisión laboral requiere actor `FAMILY_EMPLOYER`. |
| 2 | La plataforma no emplea, dirige ni sanciona | No hay endpoints de asignación de tareas, sanción ni evaluación de desempeño impuesta. |
| 3 | La plataforma nunca custodia el sueldo | No hay entidad `Wallet`, `Balance` ni `LedgerAccount` de plataforma para salarios. `Payment` sólo registra un movimiento familia → trabajadora. |
| 4 | Transferencia directa familia → trabajadora | `PaymentProvider` sólo puede iniciar/registrar pagos con destino la cuenta de la trabajadora. |
| 5 | Nunca solicitar ni almacenar claves fiscales | No existe campo, DTO, log ni columna para clave fiscal. Test de CI que falla si aparece el patrón. |
| 6 | Sin scraping ni automatización de navegador contra ARCA | No hay dependencias de Puppeteer/Playwright en `apps/api`. Playwright sólo en E2E de nuestra propia web. |
| 7 | El recibo oficial se genera en ARCA | El sistema nunca emite un recibo. Genera una **preliquidación** y luego importa el PDF oficial. |
| 8 | Preliquidación, asistencia, importación, validación, conciliación | Alcance exacto del módulo ARCA en el MVP. |
| 9 | El contador opera con su propia clave y autorización formal | Se persiste el **estado** de la delegación (fecha alta, vigencia, revocación), nunca la credencial. |
| 10 | Integración ARCA futura vía adaptador + feature flag | `ARCAConnector` con `ManualAssistedARCAConnector` activo y `OfficialARCAConnector` deshabilitado. |
| 11 | Dinero con decimal exacto | `Money` con `decimal.js`/`Prisma.Decimal`. `float` prohibido por regla de lint. |
| 12 | Fórmulas versionadas, parametrizadas y probadas | `packages/payroll-engine` puro + `PayrollParameterVersion` inmutable. |
| 13 | Toda operación sensible auditada | `AuditEvent` append-only en la misma transacción o vía outbox. |
| 14 | Minimización de datos personales | Sólo se recolecta lo que un requerimiento explícito justifica. |
| 15 | Ubicación sólo durante el fichaje, precisión mínima | Sin tracking continuo. Se guarda precisión aproximada, no traza. |
| 16 | Funciona sin API pública de Casas Particulares | El camino asistido es el camino principal, no un fallback. |

## 4. El recorrido mensual (núcleo del producto)

```
  ┌─ La familia y la trabajadora fichan y registran novedades durante el mes
  │
  ├─ Cierre de asistencia:   la familia aprueba las jornadas del período
  ├─ Preliquidación:         el motor calcula conceptos con la versión normativa vigente
  ├─ Revisión profesional:   (opcional, según plan) el contador aprueba u observa
  ├─ Aprobación:             la familia aprueba la liquidación
  ├─ ARCA asistido:          checklist + enlace oficial + datos a informar
  ├─ Importación del recibo: PDF oficial cargado y validado
  ├─ Comparación:            recibo oficial vs. preliquidación → diferencias clasificadas
  ├─ Pago:                   transferencia directa registrada con comprobante
  └─ Conciliación y cierre:  sin diferencias pendientes → período CLOSED, todo auditado
```

Regla estructural derivada de la sección 14.1: **el registro de horas y el cálculo de la preliquidación
nunca dependen de la disponibilidad de ARCA.**

## 5. Requerimientos "Debe" del MVP, por área

Extraídos de la sección 7 del documento. Los IDs son estables y se usan en el backlog.

| Área | IDs "Debe" | Total |
| --- | --- | --- |
| Identidad, acceso y consentimiento | SEG-01..04, SEG-06..08 | 7 |
| Perfiles y verificación | PER-01, PER-02, PER-03, PER-08, PER-09, PER-10 | 6 |
| Marketplace | MKT-08 (sólo moderación) | 1 (fuera de sprint 1) |
| Relación laboral | REL-01..07 | 7 |
| Fichaje y novedades | FIC-01, FIC-02, FIC-04..09 | 8 |
| Motor de liquidación | LIQ-01..14 | 14 |
| ARCA y recibo oficial | ARC-01..10 | 10 |
| Servicio de contador | CON-01..08, CON-11, CON-12, CON-13 | 11 |
| Pagos y conciliación | PAG-01, PAG-02, PAG-03, PAG-05, PAG-06, PAG-07, PAG-08, PAG-10 | 8 |
| Documentos, avisos y soporte | DOC-01, DOC-02, DOC-04, DOC-05, NOT-01, NOT-03, SUP-01, SUP-02 | 8 |
| Administración y analítica | ADM-01..03, ADM-05..08, ADM-10 | 8 |

**88 requerimientos "Debe"**, de los cuales el primer incremento vertical toca aproximadamente 30.

## 6. Reglas de negocio que no se pueden negociar (sección 8)

Las quince reglas RN-01..RN-15 del documento. Las que tienen impacto directo sobre el esquema de datos:

- **RN-01 / RN-02** — Todo parámetro tiene vigencia desde/hasta y fuente oficial; una liquidación cerrada
  conserva la versión exacta usada. → `PayrollParameterVersion` inmutable + FK desde `PayrollCalculation`.
- **RN-03** — El sistema **no infiere** una jornada faltante; solicita corrección. → Nunca autocompletar fichajes.
- **RN-04** — Horas reales y horas computables se guardan **separadamente**. → Dos campos distintos en `TimeEntry`.
- **RN-06** — Toda modificación posterior al cierre crea una rectificativa. → `PayrollVersion` encadenada, sin update in-place.
- **RN-07** — Los mínimos legales generan validaciones bloqueantes configurables. → `BlockingError` en el motor.
- **RN-09** — El salario no se mezcla con suscripciones, comisiones ni honorarios. → Tablas y flujos separados.
- **RN-10** — Cambios de CBU/CVU requieren confirmación reforzada. → Evento de auditoría + MFA + notificación.
- **RN-13** — Precisión decimal y reglas de redondeo documentadas. → `Money` + política de redondeo explícita.
- **RN-14** — Cambios normativos sin actualizar las apps móviles. → Parámetros servidos por API, nunca embebidos.

## 7. Métricas de validación (sección 2.3)

| Indicador | Meta inicial |
| --- | --- |
| Activación de familia | ≥ 60 % |
| Adopción de fichaje | ≥ 70 % de jornadas previstas |
| Liquidaciones cerradas | ≥ 60 % mensual |
| Conciliación completa | ≥ 50 % en piloto |
| Conversión a plan pago | ≥ 30 % |
| Retención mensual | ≥ 80 % |
| Errores críticos de liquidación | 0 — todo incidente se rectifica y audita |

Estas métricas se instrumentan con identificadores **seudónimos**. La sección 15 prohíbe expresamente
enviar nombres, DNI, CUIL, CBU, domicilios, recibos, montos detallados o mensajes a plataformas
publicitarias. No se incorporan SDK publicitarios.

## 8. Fuera de alcance (explícito)

Del documento (3.3) y del prompt de implementación:

- Actuar como empleador o dirigir operativamente a las trabajadoras.
- Recibir, custodiar o distribuir fondos salariales desde cuentas propias.
- Almacenar clave fiscal, cookies o credenciales de ARCA.
- Automatizar el portal de ARCA (scraping, robots de navegador, ingeniería inversa).
- Emitir un recibo privado como sustituto del oficial.
- Asesoramiento médico, terapéutico o de cuidado profesional regulado.
- **En el primer sprint**: marketplace, matching, chat, contratación, pagos reales, API real de ARCA,
  verificación automática de identidad, facturación real, geolocalización continua, IA, microservicios.

## 9. Criterios de salida del MVP (sección 17)

| Área | Criterio |
| --- | --- |
| Funcional | Una familia crea relación, invita a trabajadora, configura calendario y completa un período. |
| Fichaje | Entrada, salida, corrección, aprobación y exportación funcionan en línea y con conectividad intermitente. |
| Liquidación | Los escenarios definidos por el profesional pasan regresión y explican cada concepto. |
| ARCA | El usuario completa el flujo oficial sin entregar su clave; se importa y concilia el recibo. |
| Contador | Asignación, revisión, faltantes, documentos y cierre con auditoría. |
| Pago | El sueldo se transfiere o registra directamente y se evita duplicación. |
| Seguridad | MFA, permisos, cifrado, backups, monitoreo y pruebas de seguridad aprobados. |
| Privacidad | Consentimientos, política, derechos del titular y retención implementados. |
| Operaciones | Protocolo de soporte, incidentes, correcciones y actualización normativa. |
| Negocio | El piloto demuestra familias dispuestas a pagar el plan mensual. |

## 10. Advertencia sobre parámetros normativos

El documento **no publica escalas salariales, porcentajes de aportes, contribuciones ni valores de ART**,
y su sección 20 lista las fuentes oficiales (F1..F12) como enlaces a revisar antes de cada publicación.

En consecuencia, y siguiendo la instrucción explícita de no inventar valores normativos:

> Todo parámetro numérico presente en este repositorio es un **fixture de prueba**, marcado como tal,
> con `source = "FIXTURE — DATO DE PRUEBA, NO OFICIAL"` y `status = DRAFT`. Ningún valor de este
> repositorio debe presentarse como oficial hasta que un contador matriculado lo cargue, revise y
> publique mediante el flujo de doble control descrito en `docs/architecture.md`.

El motor de liquidación está diseñado para que sustituir esos fixtures por valores oficiales sea una
operación de datos, no de código.
