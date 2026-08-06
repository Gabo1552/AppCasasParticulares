# Arquitectura

> Complementa `docs/domain-model.md` (qué modela el sistema) y `docs/adr/0001-initial-architecture.md`
> (por qué se eligió esto). Las decisiones abiertas están en `docs/open-decisions.md`.

## 1. Decisión de fondo: monolito modular

El documento de requerimientos es explícito (sección 14):

> "Comenzar con un monolito modular bien separado, no con microservicios. Reduce costo y complejidad
> mientras conserva límites claros para escalar integraciones, pagos y liquidación."

Un despliegue, una base de datos, límites de módulo estrictos. Los módulos están preparados para
extraerse si algún día hace falta, pero **no se paga hoy el costo de la red**.

## 2. Diagrama de contenedores

```
                                    ┌──────────────────────────────┐
    ┌──────────────┐                │       ARCA (portal oficial)  │
    │ App móvil    │                │  El usuario opera con SU     │
    │ Expo / RN    │                │  clave fiscal, fuera de la   │
    │ familia +    │                │  app. Sólo enlace saliente.  │
    │ trabajadora  │                └──────────────▲───────────────┘
    └──────┬───────┘                               │ enlace https (target=_blank)
           │ HTTPS/JSON                            │ (nunca embebido, nunca scraping)
           │                                       │
    ┌──────▼─────────────┐                 ┌───────┴─────────────────────────────┐
    │  apps/web          │                 │                                     │
    │  Next.js           │  HTTPS/JSON     │        apps/api  (NestJS)           │
    │  familia,          ├────────────────▶│  ┌───────────────────────────────┐  │
    │  contador,         │                 │  │ HTTP layer: controllers,      │  │
    │  backoffice        │                 │  │ Zod validation, OpenAPI,      │  │
    └────────────────────┘                 │  │ guards RBAC + ABAC            │  │
                                           │  ├───────────────────────────────┤  │
                                           │  │ Módulos de aplicación (26)    │  │
                                           │  │ Identity … Support            │  │
                                           │  ├───────────────────────────────┤  │
                                           │  │ Puertos (interfaces)          │  │
                                           │  │ ARCAConnector                 │  │
                                           │  │ PaymentProvider               │  │
                                           │  │ ObjectStorage                 │  │
                                           │  │ NotificationChannel           │  │
                                           │  │ AntivirusScanner              │  │
                                           │  └───────────────────────────────┘  │
                                           └──┬──────────┬──────────┬────────────┘
                                              │          │          │
                        ┌─────────────────────▼──┐  ┌────▼─────┐  ┌─▼──────────────┐
                        │ PostgreSQL             │  │  Redis   │  │ Object storage │
                        │ Prisma, migraciones,   │  │ BullMQ,  │  │ MinIO (dev)    │
                        │ auditoría append-only  │  │ locks,   │  │ S3-compat (prod)│
                        └────────────────────────┘  │ idempot. │  │ privado+cifrado│
                                                    └──────────┘  └────────────────┘
                                              │
                                       ┌──────▼───────────────────────────┐
                                       │  Workers BullMQ (mismo binario,  │
                                       │  modo `worker`)                  │
                                       │  outbox, notificaciones,         │
                                       │  scan AV, recordatorios,         │
                                       │  cierres de período              │
                                       └──────────────────────────────────┘

   Adaptadores del MVP (todos internos, ninguno llama a un tercero):
     ARCAConnector      → ManualAssistedARCAConnector   (activo)
                        → OfficialARCAConnector          (feature flag OFF, lanza error controlado)
     PaymentProvider    → ManualTransferProvider         (activo)
     ObjectStorage      → S3CompatibleStorage (MinIO en dev)
```

## 3. Estructura del monorepo

```
apps/
  web/                 Next.js (App Router). Familia, contador, backoffice.
  api/                 NestJS. Monolito modular + workers BullMQ.
  mobile/              Expo / React Native. Estructura mínima en esta etapa.

packages/
  domain/              Tipos del dominio, máquinas de estado, objetos de valor, errores. Puro.
  payroll-engine/      Motor de liquidación. Puro, sin IO. Depende sólo de `domain`.
  database/            Esquema Prisma, migraciones, cliente, seeds.
  contracts/           Esquemas Zod + tipos compartidos web/api/mobile. Fuente de OpenAPI.
  ui/                  Componentes React compartidos web (y luego mobile).
  config/              tsconfig, eslint, prettier, vitest base compartidos.
  observability/       Logger estructurado, correlation id, métricas, health/readiness, redacción.

infrastructure/
  docker/              docker-compose de desarrollo (postgres, redis, minio, mailhog).
  ci/                  scripts auxiliares de pipeline.

docs/
  adr/                 Decisiones de arquitectura.
```

### Grafo de dependencias entre paquetes

```
  domain  ◀── payroll-engine
    ▲  ▲
    │  └────── contracts ◀── web, mobile
    │                    ◀── api
    └────────── database ◀── api
  config  ◀── (todos)
  observability ◀── api
  ui ◀── web
```

Regla verificada en CI: **`payroll-engine` no puede importar `database`, `contracts`, Nest, Next ni Prisma.**

## 4. Por qué cada pieza

| Pieza                   | Motivo                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **pnpm**                | Workspaces con `node_modules` estricto: un paquete no puede importar lo que no declaró. Eso hace cumplir el grafo de arriba por construcción, no por convención. |
| **Turborepo**           | Cacheo de tareas y grafo de dependencias. En CI, `turbo run lint typecheck test build` sólo reconstruye lo que cambió.                                           |
| **Next.js**             | Web responsive con SSR para el panel del contador (listas grandes, filtros) y autogestión de la familia.                                                         |
| **NestJS**              | Módulos con inyección de dependencias: encaja con "monolito modular con límites claros" y hace natural el patrón puerto/adaptador para ARCA y pagos.             |
| **PostgreSQL**          | Transaccional, con `NUMERIC` exacto para dinero y row level constraints. Lo recomienda el documento (sección 14).                                                |
| **Prisma**              | Migraciones versionadas y tipado. `Prisma.Decimal` para dinero.                                                                                                  |
| **Redis + BullMQ**      | Colas para outbox, notificaciones, scan AV y recordatorios. Locks distribuidos para cierre de período. Claves de idempotencia con TTL.                           |
| **Expo / React Native** | Fichaje móvil con soporte offline. En esta etapa sólo estructura mínima.                                                                                         |
| **Zod**                 | Un solo esquema para validar en API y en cliente, y para generar OpenAPI.                                                                                        |
| **Vitest**              | Rápido, ESM nativo, ideal para el motor puro.                                                                                                                    |
| **Playwright**          | E2E de **nuestra** web. Nunca contra ARCA.                                                                                                                       |

## 5. Módulos del backend

26 módulos, cada uno con su carpeta, su `*.module.ts`, sus servicios de aplicación, sus DTO Zod y sus tests.

| Contexto               | Módulos                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------- |
| Identidad y acceso     | `identity`, `users`, `audit`                                                        |
| Partes                 | `employers`, `workers`, `accountants`, `professional-assignments`                   |
| Relación laboral       | `households`, `employment-relationships`, `work-schedules`                          |
| Tiempo y novedades     | `time-tracking`, `attendance-corrections`, `employment-events`                      |
| Liquidación            | `payroll-parameters`, `payroll-periods`, `payroll-calculations`, `payroll-versions` |
| Cumplimiento           | `arca-tasks`, `arca-documents`                                                      |
| Liquidación financiera | `payments`, `reconciliation`                                                        |
| Soporte                | `documents`, `notifications`, `subscriptions`, `administration`, `support`          |

Marketplace, matching, chat y contratación **no tienen módulo** en esta etapa. Cuando existan, entrarán
detrás de `FEATURE_MARKETPLACE`, no como stub que aparente funcionar.

### Anatomía de un módulo

```
src/modules/<nombre>/
  <nombre>.module.ts          Wiring Nest
  <nombre>.controller.ts      HTTP, validación Zod, decoradores OpenAPI
  <nombre>.service.ts         Casos de uso. Orquesta dominio + repositorio + auditoría
  <nombre>.repository.ts      Acceso Prisma. Única capa que conoce el esquema
  dto/                        Esquemas Zod (importados de @app/contracts cuando son compartidos)
  policies/                   Autorización por objeto (ABAC)
  __tests__/                  Unitarias + integración
```

## 6. Autorización: RBAC + permisos por objeto

Dos capas, ambas obligatorias. Un rol nunca alcanza por sí solo.

**Capa 1 — RBAC.** `@Roles('FAMILY_EMPLOYER')` responde "¿este tipo de usuario puede intentar esta acción?"

**Capa 2 — ABAC / permisos por objeto.** Una `policy` responde "¿este usuario concreto puede tocar
**este** recurso concreto?" Resuelve la pregunta que el requerimiento SEG-03 plantea:

> "Un usuario no accede a relaciones no vinculadas."

```
canAccessRelationship(actor, relationshipId):
  FAMILY_EMPLOYER      → es el employer de esa relación
  WORKER               → es la worker de esa relación
  ACCOUNTANT           → tiene ProfessionalAssignment ACTIVE sobre esa relación
  ACCOUNTANT_MANAGER   → la relación pertenece a su estudio
  SUPPORT_AGENT        → sólo lectura, sólo con ticket abierto vinculado, auditado
  OPERATIONS_AGENT     → sólo lectura agregada, auditado
  PLATFORM_ADMIN       → acceso excepcional: requiere motivo + expiración + auditoría (13.1)
```

La policy se evalúa **en el backend siempre**, aunque la UI oculte el botón (regla 14.1 del documento).

## 7. Dinero y precisión

- Transporte y almacenamiento: `NUMERIC(18,4)` en PostgreSQL, `Prisma.Decimal` en TypeScript.
- Cálculo: `decimal.js` dentro de `payroll-engine`, encapsulado en el objeto de valor `Money`.
- API: los importes viajan como **string decimal** en JSON, nunca como `number` (JSON no tiene decimal exacto).
- Redondeo: explícito por concepto, tomado del parámetro normativo, y registrado en la traza.
- Lint: regla que prohíbe `parseFloat`, `Number(...)` y operadores aritméticos sobre importes en las
  rutas de dinero.

## 8. Idempotencia y concurrencia

| Escenario                 | Mecanismo                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| Fichaje offline reenviado | `clientIdempotencyKey` UUID generado por el cliente, único por relación (INV-TIME-03)       |
| Registro de pago          | `Idempotency-Key` HTTP → tabla `IdempotencyRecord` con hash de request y respuesta cacheada |
| Cierre de período         | Lock distribuido en Redis por `payrollPeriodId` + `version` optimista en la fila            |
| Recálculo                 | Determinista: recalcular no cambia nada si la entrada no cambió                             |
| Webhook de PSP (futuro)   | Deduplicación por `providerEventId` + verificación de firma                                 |
| Edición concurrente       | Columna `version` (optimistic locking) en toda entidad crítica. Conflicto → HTTP 409        |

## 9. Auditoría y outbox

Toda operación sensible escribe un `AuditEvent`. La lista de operaciones auditadas está en
`docs/security-model.md`, sección 6.

```
  Transacción de negocio
  ├── INSERT/UPDATE de la entidad
  ├── INSERT en audit_event           ← misma transacción (14.1)
  └── INSERT en outbox_message        ← misma transacción, si hay efecto externo
                                          (notificación, indexación, webhook)
         │
         └──▶ worker BullMQ consume el outbox, marca `processedAt`, reintenta con backoff
```

`audit_event` es append-only: el rol de aplicación de PostgreSQL sólo tiene `INSERT` y `SELECT` sobre
esa tabla. `UPDATE` y `DELETE` están revocados.

## 10. Documentos

```
Cliente ──1. solicita subida──▶ API ──valida MIME/tamaño/permisos──▶ URL firmada PUT (TTL corto)
Cliente ──2. sube a storage──▶ MinIO/S3 (bucket privado)
API     ──3. encola scan──▶ worker AV ──▶ Document.scanStatus = CLEAN | INFECTED
API     ──4. calcula sha256, persiste metadatos, audita
Cliente ──5. solicita descarga──▶ API valida permiso ──▶ URL firmada GET (TTL corto) + AuditEvent
```

Controles: bucket **nunca público**, MIME validado por contenido (no por extensión), tamaño máximo,
`sha256` persistido, cifrado en reposo, política de retención por tipo, auditoría de cada descarga.

## 11. Observabilidad

- **Logs estructurados** JSON (`pino`) con `correlationId` propagado por `AsyncLocalStorage`.
- **Redacción** obligatoria antes de serializar: CBU/CVU, tokens, documentos de identidad, importes
  detallados en contextos analíticos. Lista de campos en `packages/observability`.
- **Métricas** Prometheus: latencia HTTP, jobs por estado, duración del cálculo, períodos por estado,
  diferencias de conciliación abiertas.
- **Trazas** OpenTelemetry, con el mismo `correlationId`.
- **Health / readiness**: `/health` (proceso vivo) y `/ready` (Postgres + Redis + storage alcanzables).
- **Jobs fallidos**: cola de fallos con motivo, intentos y payload redactado.
- Sin SDK publicitarios en ningún cliente.

## 12. Configuración y feature flags

Toda la configuración por variables de entorno, validada con Zod al arrancar (fail fast).

| Flag                              | Valor inicial  | Efecto                                                                                          |
| --------------------------------- | -------------- | ----------------------------------------------------------------------------------------------- |
| `FEATURE_ARCA_OFFICIAL_CONNECTOR` | `false`        | Si `true`, se resuelve `OfficialARCAConnector`, que hoy lanza `ARCAIntegrationNotEnabledError`. |
| `FEATURE_MARKETPLACE`             | `false`        | Reservado. Sin código detrás en esta etapa.                                                     |
| `FEATURE_REAL_PAYMENTS`           | `false`        | Reservado para el PSP. Hoy sólo `ManualTransferProvider`.                                       |
| `FEATURE_IDENTITY_VERIFICATION`   | `false`        | Reservado. Hoy verificación manual interna.                                                     |
| `FEATURE_MFA_ENFORCED`            | `false` en dev | MFA obligatorio para `ACCOUNTANT*` y `*_ADMIN`.                                                 |

Ninguna funcionalidad futura se simula. Un flag apagado significa que la ruta no existe o devuelve un
error explícito, no un resultado inventado.

## 13. Entornos y despliegue

| Entorno    | Base                                   | Storage           | ARCA             | Pagos            |
| ---------- | -------------------------------------- | ----------------- | ---------------- | ---------------- |
| local      | Postgres en Docker                     | MinIO             | `ManualAssisted` | `ManualTransfer` |
| ci         | Postgres efímero                       | MinIO efímero     | `ManualAssisted` | `ManualTransfer` |
| staging    | Postgres gestionado                    | S3-compat         | `ManualAssisted` | `ManualTransfer` |
| production | Postgres gestionado + backups probados | S3-compat cifrado | `ManualAssisted` | según OD-05      |

Homologación y producción de ARCA quedarán **segregadas** (certificados, endpoints y registros) si
alguna vez se habilita el conector oficial (ARC-12).

## 14. Estrategia de pruebas

| Nivel               | Herramienta                     | Alcance                                                              |
| ------------------- | ------------------------------- | -------------------------------------------------------------------- |
| Unitario puro       | Vitest                          | `payroll-engine` (escenarios legales), `domain` (máquinas de estado) |
| Unitario de módulo  | Vitest                          | Servicios con repositorios en doble                                  |
| Integración         | Vitest + Postgres real (docker) | Repositorios, transacciones, auditoría, idempotencia, concurrencia   |
| Contrato            | Zod + OpenAPI                   | El esquema publicado coincide con el validado                        |
| E2E web             | Playwright                      | El recorrido vertical completo                                       |
| Regresión normativa | Vitest + fixtures versionados   | Un cambio de parámetro no altera liquidaciones históricas            |

El motor de liquidación se prueba primero y con más profundidad que el resto: es donde un error tiene
consecuencia legal y monetaria (métrica "errores críticos = 0").

## 15. Notas de instalación

### `pnpm.overrides` de los tipos de React

El manifiesto raíz fija `@types/react` y `@types/react-dom` en una sola versión para todo el
workspace. El motivo: `styled-jsx`, empaquetado dentro de Next 15, declara `@types/react` en el rango
de la versión 18. Con el linker aislado de pnpm eso deja **dos copias** de los tipos de React en el
programa de TypeScript de `apps/web`, y el typecheck falla con un choque entre `ReactNode` de la 18 y
el de la 19 (`ReactPortal` cambió de forma entre ambas).

El override alinea las dos y el typecheck vuelve a pasar. `apps/mobile` usa React 18 en tiempo de
ejecución (Expo 52 / React Native 0.76); comparte los tipos de la 19, lo que hoy no genera conflicto
en su superficie mínima. Si `apps/mobile` crece y el desajuste aparece, la salida es separar los
programas de TypeScript, no revertir el override.

Como los manifiestos `package.json` no admiten comentarios, la decisión queda registrada acá.

### `pnpm.overrides` de remediación de seguridad

Cinco paquetes más están fijados por seguridad. Ninguno es una dependencia directa del proyecto:
todos llegan por el árbol de Expo, Next o Vitest, así que subirlos desde el `package.json` propio no
es posible y esperar al upstream dejaría el gate de `pnpm audit --audit-level high` en rojo.

| Paquete          | Fijado en | Llega por                                     |
| ---------------- | --------- | --------------------------------------------- |
| `tar`            | `^7.5.22` | Expo (denegación de servicio al descomprimir) |
| `vite`           | `^6.4.3`  | Vitest                                        |
| `@xmldom/xmldom` | `^0.9.8`  | Expo                                          |
| `glob`           | `^10.5.0` | Expo                                          |
| `js-yaml`        | `^4.1.1`  | `@nestjs/swagger`                             |
| `postcss`        | `^8.5.18` | Expo y Next                                   |
| `sharp`          | `^0.35.0` | Next                                          |

El efecto medido: de 36 vulnerabilidades (20 altas y 2 críticas) a 3 moderadas. Cada override es
provisional — cuando el upstream publique una versión que ya incluya el parche, corresponde
eliminarlo, no acumularlo.

### `pnpm.onlyBuiltDependencies`

pnpm 10 no ejecuta scripts de instalación salvo autorización explícita. La lista incluye únicamente
los paquetes que necesitan compilar o descargar un binario nativo: `esbuild`, el motor de Prisma,
`@nestjs/core`, `sharp` y `msgpackr-extract`.

## 16. Qué queda deliberadamente afuera

- Microservicios, service mesh, event sourcing, CQRS. No hay problema que los justifique hoy.
- GraphQL. La API es REST + OpenAPI, que es lo que el documento pide (NFR-10).
- Multi-tenancy física. El aislamiento es por permisos de objeto, no por base separada.
- Kubernetes en esta etapa. Docker Compose para desarrollo; la decisión de producción es OD-16.
