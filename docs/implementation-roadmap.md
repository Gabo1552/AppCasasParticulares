# Hoja de ruta de implementación

> Alinea la sección 16 del documento de requerimientos con el plan de ejecución técnica.
> El alcance de cada fase se define por **criterio de salida verificable**, no por fecha.

## 1. Mapa general

| Fase   | Nombre               | Alcance                                                                          | Criterio de salida                                                                                                   |
| ------ | -------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **E1** | Descubrimiento       | Análisis, dominio, arquitectura, seguridad, ARCA, roadmap, decisiones, ADR       | Los 8 documentos existen y las decisiones abiertas están enumeradas                                                  |
| **E2** | Base técnica         | Monorepo, herramientas, esquema de datos, CI, Docker, esqueletos de apps         | `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build` verde; `docker compose up` levanta el stack |
| **E3** | Recorrido vertical   | Los 16 pasos del primer incremento funcional                                     | Un E2E recorre registro → conciliación con todo auditado                                                             |
| **E4** | Robustez del motor   | Los 13 escenarios de prueba del motor + parámetros administrables                | Regresión normativa verde; un cambio de parámetro no altera liquidaciones históricas                                 |
| **E5** | Contador y operación | Cola profesional, delegaciones, observaciones, reasignación, backoffice          | Un contador procesa una cartera de N familias con auditoría completa                                                 |
| **E6** | Móvil y offline      | Expo funcional: fichaje offline, sincronización, correcciones                    | Fichaje con conectividad intermitente, sin duplicados                                                                |
| **E7** | Endurecimiento       | MFA, cifrado de campos, rate limiting, backups probados, observabilidad completa | Checklist de `docs/security-model.md` verificado; pentest externo                                                    |
| **E8** | Piloto               | Fase 0 del documento: 20-30 familias, contadores reales                          | Métricas de la sección 2.3 medidas                                                                                   |
| **F+** | Futuro               | v1.1 confianza, v1.2 marketplace, v2 integraciones                               | Fuera de este plan                                                                                                   |

## 2. Fase E1 — Descubrimiento (esta ejecución)

**Entregables**

| Archivo                                 | Contenido                                                                    |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| `docs/product-summary.md`               | Producto, actores, principios, recorrido mensual, alcance                    |
| `docs/domain-model.md`                  | Lenguaje ubicuo, contextos, agregados, invariantes, máquinas de estado       |
| `docs/architecture.md`                  | Monolito modular, monorepo, módulos, dinero, idempotencia, observabilidad    |
| `docs/security-model.md`                | Autenticación, autorización, cifrado, auditoría, privacidad, CI de seguridad |
| `docs/arca-integration-strategy.md`     | Puerto, conector manual, conector oficial deshabilitado, delegación          |
| `docs/implementation-roadmap.md`        | Este documento                                                               |
| `docs/open-decisions.md`                | Decisiones pendientes, con impacto y bloqueo                                 |
| `docs/adr/0001-initial-architecture.md` | ADR de la arquitectura inicial                                               |
| `docs/requirements-extract.md`          | Extracción textual íntegra del DOCX                                          |

**Criterio de salida**: los documentos existen, son consistentes entre sí, y ninguna decisión abierta
bloquea el arranque de E2.

## 3. Fase E2 — Base técnica

**Objetivo**: que un desarrollador nuevo clone, ejecute dos comandos y tenga el stack corriendo con
pruebas verdes. Sin lógica de negocio todavía más allá del motor y las máquinas de estado.

### E2.1 Andamiaje del monorepo

- `pnpm-workspace.yaml`, `turbo.json`, `package.json` raíz con scripts unificados.
- `packages/config`: `tsconfig` base estricto, ESLint plano, Prettier, base de Vitest.
- `.editorconfig`, `.gitignore`, `.nvmrc`, `.env.example`.

### E2.2 Paquetes de dominio

- `packages/domain`: objetos de valor (`Money`, `Minutes`, `DateRange`, `MaskedAccount`), enums de
  estado, **máquinas de estado** de las tres entidades con sus tests, errores del dominio, puertos
  (`ARCAConnector`, `PaymentProvider`, `ObjectStorage`).
- `packages/payroll-engine`: motor puro, catálogo de conceptos, reglas, fixtures marcados, tests.
- `packages/contracts`: esquemas Zod compartidos.

### E2.3 Datos

- `packages/database`: esquema Prisma completo (~35 modelos), migración inicial, seeds ficticios,
  `audit_event` append-only por permisos de rol.

### E2.4 Aplicaciones

- `apps/api`: NestJS con los 26 módulos declarados, health/readiness, OpenAPI, guards RBAC+ABAC,
  adaptadores manuales de ARCA y pagos, BullMQ.
- `apps/web`: Next.js con layout, autenticación y las pantallas del recorrido vertical (esqueleto).
- `apps/mobile`: Expo mínimo — navegación y pantalla de fichaje, sin lógica offline todavía.

### E2.5 Infraestructura y CI

- `infrastructure/docker/docker-compose.yml`: Postgres, Redis, MinIO, Mailhog.
- `.github/workflows/ci.yml`: install → lint → typecheck → test unit → test integración → build →
  verificación de migraciones → `pnpm audit` → controles de `docs/security-model.md` §12.
- `.github/dependabot.yml`.

**Criterio de salida**: pipeline verde de punta a punta y `README.md` con instrucciones que funcionan.

## 4. Fase E3 — Recorrido vertical

Exactamente los 16 pasos del encargo. Cada uno es una historia con test.

| #   | Paso                                    | Módulos                                      | Requerimientos                 | Estado      |
| --- | --------------------------------------- | -------------------------------------------- | ------------------------------ | ----------- |
| 1   | Una familia se registra                 | `identity`, `users`, `employers`             | SEG-01, SEG-04, PER-02         | ✅ Completo |
| 2   | Crea un domicilio laboral               | `households`                                 | PER-02, REL-02                 | ✅ Completo |
| 3   | Invita a una trabajadora                | `employment-relationships`, `notifications`  | REL-01                         | ✅ Completo |
| 4   | La trabajadora acepta                   | `workers`, `employment-relationships`        | REL-01, REL-08                 | ✅ Completo |
| 5   | La familia configura la relación        | `employment-relationships`                   | REL-02, REL-03, REL-05         | ✅ Completo |
| 6   | Se genera un calendario semanal         | `work-schedules`                             | REL-04                         | ✅ Completo |
| 7   | La trabajadora ficha entrada y salida   | `time-tracking`                              | FIC-01, FIC-02, FIC-05         |
| 8   | La familia aprueba el fichaje           | `time-tracking`, `attendance-corrections`    | FIC-06, FIC-07                 |
| 9   | Se abre un período mensual              | `payroll-periods`                            | LIQ-01                         |
| 10  | Se calcula la preliquidación (fixtures) | `payroll-calculations`, `payroll-parameters` | LIQ-02, LIQ-04, LIQ-11         |
| 11  | La familia ve el detalle de conceptos   | `payroll-calculations`, web                  | LIQ-11, LIQ-14                 |
| 12  | Se genera una tarea ARCA asistida       | `arca-tasks`                                 | ARC-01, ARC-02, ARC-04         |
| 13  | Se carga un recibo de prueba            | `arca-documents`, `documents`                | ARC-05, DOC-01, DOC-04         |
| 14  | Se registra una transferencia manual    | `payments`                                   | PAG-01, PAG-05, PAG-07, PAG-10 |
| 15  | El período queda conciliado             | `reconciliation`                             | ARC-07, PAG-06                 |
| 16  | Todo queda auditado                     | `audit`                                      | SEG-08                         |

Los pasos 7 a 16 siguen pendientes; la tabla los conserva sin marca de estado.

**Criterio de salida**: un test E2E de Playwright recorre los 16 pasos; la tabla `audit_event` contiene
los 15 tipos de evento esperados; el período llega a `RECONCILED`.

### Estado de los pasos 1 a 6

Entregados y verificados contra PostgreSQL real y en navegador:

- **Autenticación** por código de un solo uso enviado por correo. Sin contraseñas y sin OAuth. El
  código se guarda como HMAC ligado al destino, vence a los 10 minutos, admite 5 intentos y está
  limitado a 5 pedidos por ventana de 15 minutos. La respuesta es idéntica exista o no la cuenta.
- **Sesiones** con refresh rotativo: reutilizar un token ya rotado invalida la familia entera.
  Cookies `HttpOnly` + doble envío de CSRF. El modelo ya tiene `mfaEnabled` y el secreto cifrado,
  así que sumar MFA no exige migrar.
- **Perfiles** de familia y trabajadora con los mismos campos. Crear el perfil es lo que otorga el
  rol: un usuario autenticado sin perfil no puede operar. No se pide clave fiscal, datos bancarios,
  información impositiva ni documentación.
- **Domicilios** con propiedad verificada por objeto: un domicilio ajeno responde 404, no 403.
  Baja lógica, nunca borrado. Sin coordenadas en este sprint.
- **Invitaciones** con token de 32 bytes guardado sólo como hash, de un solo uso, con vencimiento,
  reenvío que invalida el anterior y baja. Aceptar **no** crea una relación activa.
- **Condiciones y calendario**, con la remuneración como decimal exacto de punta a punta y el aviso
  de datos de prueba en toda pantalla que muestre montos o categorías.
- **Activación sólo por la trabajadora** (ADR 0002). No existe endpoint genérico de cambio de estado.

Cobertura: 262 pruebas unitarias, 48 de integración contra PostgreSQL real y 4 recorridos E2E en
Chromium. Los ocho casos negativos de autorización del encargo tienen prueba propia.

**Deuda conocida de los pasos 1 a 6**: sin paginación en los listados (no hace falta con los
volúmenes de una familia); sin edición de condiciones una vez activa la relación (es un cambio de
condiciones vigentes, que corresponde a otra etapa); el rate limiting de OTP vive en la base y
debería moverse a Redis cuando haya más de una instancia; las notificaciones se envían en línea y
convendría pasarlas a la cola de BullMQ.

**No se implementa en E3**: marketplace, matching, chat, pagos reales, API real de ARCA, verificación
automática de identidad, facturación real, geolocalización continua, IA, microservicios.

## 5. Fase E4 — Robustez del motor

Los 13 escenarios que el encargo enumera, cada uno con su fixture versionado:

| #   | Escenario                            | Verifica                                           |
| --- | ------------------------------------ | -------------------------------------------------- |
| 1   | Trabajadora mensualizada             | Base mensual, prorrateo                            |
| 2   | Trabajadora por hora                 | Base horaria, minutos computables                  |
| 3   | Horas extras                         | Cantidad, tasa, fuente del parámetro (LIQ-05)      |
| 4   | Feriados                             | Tratamiento diferenciado                           |
| 5   | Antigüedad                           | Vigencia y porcentaje documentados (LIQ-06)        |
| 6   | Vacaciones                           | Cálculo y su base (LIQ-08)                         |
| 7   | Aguinaldo                            | Base semestral, proporcionalidad (LIQ-08)          |
| 8   | Ausencia                             | Impacto, respaldo, aprobación (LIQ-07)             |
| 9   | Cambio de escala entre períodos      | Cada período usa su versión (RN-02)                |
| 10  | Rectificación de liquidación cerrada | Nueva versión, la anterior intacta (LIQ-13, RN-06) |
| 11  | Remuneración pactada bajo el mínimo  | Error bloqueante (LIQ-10, RN-07)                   |
| 12  | Redondeos                            | Regla explícita, documentada, en la traza (RN-13)  |
| 13  | Idempotencia del cálculo             | Misma entrada → mismo resultado, byte a byte       |

Además: administración de parámetros con borrador → revisión → publicación → rollback (ADM-02) y doble
control (CON-11).

**Criterio de salida**: los 13 escenarios verdes; recalcular un período histórico con la versión original
produce exactamente el resultado original.

> **Recordatorio**: los valores de estos fixtures **no son oficiales**. Antes del piloto, un contador
> matriculado debe cargar y publicar los parámetros reales por el flujo de doble control.

## 6. Fase E5 — Contador y operación

- Cola operativa con filtros por vencimiento, estado y prioridad (CON-05).
- Revisión: aprobar, observar, devolver, solicitar documentación (CON-06, CON-08).
- Registro de gestión completada en ARCA + adjuntos (CON-07).
- Delegaciones: alta, vigencia, revocación, sin credenciales (CON-04, ARC-09).
- Reasignación por capacidad y revocación de cartera (CON-13).
- Notas privadas vs. compartidas (CON-09).
- Honorarios y comisión facturados por separado (CON-12).
- Backoffice: usuarios, roles, parámetros, planes, contenido legal, auditoría de sólo lectura (ADM-01..08).

**Criterio de salida**: un contador procesa una cartera completa; toda acción profesional queda auditada
con matrícula y fecha.

## 7. Fase E6 — Móvil y offline

- Fichaje con QR, PIN y proximidad configurable (FIC-02).
- Cola local con `clientIdempotencyKey`; sincronización posterior sin duplicados (FIC-03).
- Solicitud de corrección desde el móvil (FIC-06).
- Notificaciones push (NOT-02).
- Sin permisos de ubicación en segundo plano.

**Criterio de salida**: fichar en modo avión, recuperar conectividad, y que el servidor registre
exactamente un evento por fichaje.

## 8. Fase E7 — Endurecimiento

Recorre `docs/security-model.md` punto por punto: MFA obligatorio, cifrado de campos con rotación de
claves, rate limiting afinado, CSP, backups con **restauración probada**, observabilidad completa,
`pnpm audit` sin hallazgos altos, escaneo de secretos, pentest externo, plan de respuesta a incidentes.

**Criterio de salida**: el checklist de la sección 17 del documento (columnas Seguridad y Privacidad)
verificado con evidencia.

## 9. Fase E8 — Piloto

La Fase 0 del documento: 20-30 familias, liquidación semimanual, prueba de delegación en ARCA con
contadores reales. Se miden los indicadores de la sección 2.3.

Aquí se resuelven empíricamente varias decisiones abiertas: delegabilidad real del servicio (OD-03),
método de fichaje preferido (OD-07), disposición a pagar (OD-08).

## 10. Backlog del primer sprint

Sprint 1 = **E2 completa + E3.1..E3.6** (registro hasta calendario). El resto de E3 va a sprint 2.

| ID    | Historia                                                                        | Estimación | Depende de |
| ----- | ------------------------------------------------------------------------------- | ---------- | ---------- |
| S1-01 | Andamiaje del monorepo con pnpm + Turborepo                                     | M          | —          |
| S1-02 | `packages/config`: TS estricto, ESLint, Prettier, Vitest                        | S          | S1-01      |
| S1-03 | `packages/domain`: objetos de valor y `Money`                                   | M          | S1-02      |
| S1-04 | `packages/domain`: tres máquinas de estado + tests                              | M          | S1-03      |
| S1-05 | `packages/domain`: puertos `ARCAConnector`, `PaymentProvider`, `ObjectStorage`  | S          | S1-03      |
| S1-06 | `packages/payroll-engine`: estructura, tipos de entrada/salida, traza           | M          | S1-03      |
| S1-07 | `payroll-engine`: mensualizada + por hora + fixtures marcados                   | L          | S1-06      |
| S1-08 | `payroll-engine`: horas extra, feriados, antigüedad                             | L          | S1-07      |
| S1-09 | `payroll-engine`: mínimo legal como error bloqueante                            | M          | S1-07      |
| S1-10 | `payroll-engine`: idempotencia y redondeos                                      | M          | S1-07      |
| S1-11 | `packages/database`: esquema Prisma completo + migración inicial                | L          | S1-04      |
| S1-12 | `packages/database`: `audit_event` append-only por permisos                     | S          | S1-11      |
| S1-13 | `packages/database`: seeds ficticios completos                                  | M          | S1-11      |
| S1-14 | `packages/contracts`: esquemas Zod compartidos                                  | M          | S1-03      |
| S1-15 | `packages/observability`: logger, correlation id, redacción, health             | M          | S1-02      |
| S1-16 | `apps/api`: bootstrap Nest, config validada, OpenAPI, health/ready              | M          | S1-15      |
| S1-17 | `apps/api`: guards RBAC + policies ABAC                                         | L          | S1-16      |
| S1-18 | `apps/api`: módulo `audit` con outbox                                           | M          | S1-16      |
| S1-19 | `apps/api`: `identity` — registro, OTP, login, sesiones                         | L          | S1-17      |
| S1-20 | `apps/api`: `employers` + `households`                                          | M          | S1-19      |
| S1-21 | `apps/api`: `workers` + invitación y aceptación                                 | L          | S1-20      |
| S1-22 | `apps/api`: `employment-relationships` con terms versionados                    | L          | S1-21      |
| S1-23 | `apps/api`: `work-schedules` y generación de jornadas esperadas                 | M          | S1-22      |
| S1-24 | `apps/api`: adaptadores `ManualAssistedARCAConnector` y `OfficialARCAConnector` | M          | S1-05      |
| S1-25 | `apps/api`: `ManualTransferProvider`                                            | S          | S1-05      |
| S1-26 | `apps/web`: layout, autenticación, alta de familia y domicilio                  | L          | S1-19      |
| S1-27 | `apps/web`: invitación, aceptación, configuración de relación                   | L          | S1-22      |
| S1-28 | `apps/mobile`: estructura Expo mínima                                           | S          | S1-14      |
| S1-29 | `infrastructure/docker`: compose de desarrollo                                  | S          | S1-11      |
| S1-30 | CI: pipeline completo + controles de seguridad                                  | M          | S1-29      |
| S1-31 | `README.md` con instrucciones verificadas                                       | S          | S1-30      |

**Definición de terminado** por historia: pruebas unitarias, pruebas de integración donde toca base de
datos, errores manejados explícitamente, permisos verificados, casos de idempotencia y concurrencia
donde apliquen, documentación mínima, migración, seed y ejemplo de uso.

## 11. Métricas de progreso

| Fase | Señal de avance                                                      |
| ---- | -------------------------------------------------------------------- |
| E2   | Pipeline verde; tiempo de arranque local < 10 min                    |
| E3   | 16/16 pasos del recorrido cubiertos por E2E                          |
| E4   | 13/13 escenarios del motor verdes                                    |
| E5   | Tiempo operativo por familia y período (indicador de la sección 2.3) |
| E6   | Fichajes offline sincronizados sin duplicados                        |
| E7   | Checklist de seguridad completo con evidencia                        |
| E8   | Indicadores de la sección 2.3 medidos sobre familias reales          |
