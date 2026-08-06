# ADR 0001 — Arquitectura inicial

- **Estado**: Aceptada
- **Fecha**: 2026-08-06
- **Decide**: equipo técnico
- **Fuentes**: `docs/Requerimientos_Plataforma_Casas_Particulares_Argentina_v1.docx` (secciones 8, 11.1,
  13, 14, 14.1) y el encargo de implementación
- **Supersede**: —

## Contexto

Se construye una plataforma para administrar relaciones laborales de personal de casas particulares en
Argentina. El sistema calcula dinero con consecuencia legal, coordina cuatro tipos de actores con
intereses distintos, y depende de un organismo (ARCA) para el cual no se confirmó la existencia de una
API pública ni la delegabilidad del servicio.

Tres restricciones condicionan todo lo demás:

1. **La plataforma no puede ser empleadora, no puede custodiar salario y no puede tocar claves fiscales.**
   Esto no es una preferencia: define qué entidades pueden existir en el modelo.
2. **Un error de liquidación tiene consecuencia legal y monetaria.** La métrica de la sección 2.3 fija
   "errores críticos = 0". Eso exige un motor determinista, versionado y exhaustivamente probado.
3. **Los parámetros normativos cambian y no están disponibles hoy.** El documento no publica escalas ni
   porcentajes; sus fuentes (F1..F12) deben revisarse antes de cada publicación.

## Decisiones

### D1 — Monolito modular, no microservicios

**Decisión**: un despliegue, una base de datos PostgreSQL, módulos con límites estrictos.

**Motivo**: lo recomienda el documento (sección 14). El dominio es fuertemente transaccional: cierre de
período, auditoría atómica, conciliación. Distribuirlo introduce transacciones distribuidas donde hoy
basta un `BEGIN`. El costo de extraer un módulo más adelante es menor que el costo de operar una red
de servicios desde el primer día con un equipo que todavía está validando el producto.

**Consecuencia**: los límites se hacen cumplir por herramientas (workspaces de pnpm con resolución
estricta, reglas de import en ESLint, grafo de dependencias en Turborepo), no por confianza.

### D2 — Monorepo TypeScript con pnpm y Turborepo

**Decisión**: `apps/{web,api,mobile}` + `packages/{domain,payroll-engine,database,contracts,ui,config,observability}`.

**Motivo**: los contratos se comparten entre web, API y móvil; con un solo repositorio, un cambio de
esquema Zod rompe el typecheck de los tres consumidores en el mismo commit. pnpm impide que un paquete
importe algo que no declaró, lo que convierte el grafo de dependencias en una restricción real.

**Consecuencia**: `payroll-engine` no puede importar Prisma ni Nest **por construcción**, no por acuerdo.

### D3 — El motor de liquidación es una librería pura

**Decisión**: `packages/payroll-engine` es una función determinista sin IO, sin HTTP, sin base de datos.
Recibe todo lo que necesita —incluida la versión completa de parámetros— y devuelve el resultado con su traza.

**Motivo**: es la pieza donde un error cuesta más. Ser pura la hace probable de forma exhaustiva y barata,
reproducible (recalcular una liquidación histórica da exactamente el resultado histórico) y auditable
(la traza explica cada línea, lo que LIQ-14 exige).

**Consecuencia**: quien llama al motor es responsable de cargar los datos. El motor nunca "va a buscar"
un parámetro: si no está en la entrada, no existe.

### D4 — Dinero con decimal exacto, en toda la cadena

**Decisión**: `NUMERIC(18,4)` en PostgreSQL, `Prisma.Decimal` en el borde de datos, `decimal.js` dentro
del motor encapsulado en `Money`, y **string decimal** en JSON.

**Motivo**: 14.1 y RN-13 lo exigen. JSON no tiene decimal exacto; serializar un importe como `number`
introduce el error binario que se está evitando en todos los demás puntos.

**Consecuencia**: los clientes formatean desde string. Una regla de lint prohíbe `parseFloat`, `Number()`
y aritmética nativa en las rutas de dinero.

### D5 — Parámetros normativos como datos versionados e inmutables

**Decisión**: `PayrollParameterVersion` con vigencia, fuente obligatoria, estado de publicación y doble
control (`preparedBy ≠ approvedBy`). Toda `PayrollCalculation` referencia la versión exacta que usó.

**Motivo**: RN-01, RN-02, LIQ-02, ADM-02 y CON-11. Además, RN-14 exige que un cambio normativo no requiera
actualizar las apps móviles — lo que sólo es posible si los parámetros viajan por API.

**Consecuencia**: los valores de este repositorio son **fixtures marcados**
(`source = "FIXTURE — DATO DE PRUEBA, NO OFICIAL"`, `status = DRAFT`). No se inventó ningún porcentaje ni
escala. Sustituirlos por valores oficiales es una operación de datos con doble control, no un despliegue.

### D6 — ARCA detrás de un puerto, con conector manual activo y oficial deshabilitado

**Decisión**: `ARCAConnector` como interfaz. `ManualAssistedARCAConnector` implementa el flujo asistido
completo. `OfficialARCAConnector` existe, está detrás de `FEATURE_ARCA_OFFICIAL_CONNECTOR=false`, y sus
cinco operaciones lanzan `ARCAIntegrationNotEnabledError`.

**Motivo**: 11.1 y ARC-11 lo piden, y el documento advierte que no hay web service confirmado. El flujo
asistido **no es un fallback**: es el producto.

**Consecuencia**: nada se simula. Un flag apagado devuelve un error explícito (HTTP 501), nunca datos
inventados. Prohibido scraping y automatización de navegador, verificado en CI.

### D7 — Pagos detrás de un puerto, sin custodia de fondos

**Decisión**: `PaymentProvider` como interfaz, con `ManualTransferProvider` como única implementación del
MVP. No existe entidad de saldo, billetera ni cuenta de plataforma para salarios.

**Motivo**: principios 3 y 4, PAG-02, sección 13.3. El riesgo regulatorio de custodiar fondos es alto y
evitable por diseño.

**Consecuencia**: el registro manual de transferencia es un camino completo con comprobante, conciliación
e idempotencia — no un placeholder. Cuando exista un PSP habilitado por BCRA (OD-05), se agrega una
implementación del puerto sin tocar el dominio.

### D8 — Autorización en dos capas: RBAC + permisos por objeto

**Decisión**: los siete roles del encargo como capa uno; políticas por recurso como capa dos, siempre
obligatoria. Evaluadas en el backend aunque la UI oculte la acción.

**Motivo**: SEG-03 lo exige textualmente ("un usuario no accede a relaciones no vinculadas") y 14.1 exige
validar en el backend. Un rol `ACCOUNTANT` no da acceso a una relación: lo da un `ProfessionalAssignment`
activo sobre esa relación concreta.

**Consecuencia**: cada módulo tiene su carpeta `policies/` con tests propios.

### D9 — Auditoría append-only en la misma transacción, con outbox para efectos externos

**Decisión**: `audit_event` con `INSERT`/`SELECT` únicamente para el rol de aplicación. El evento se
escribe en la transacción de negocio. Los efectos externos (notificaciones, integraciones) salen por
`outbox_message`, consumido por un worker BullMQ.

**Motivo**: 14.1 lo pide explícitamente. ADM-08 exige que los registros sean inmutables para usuarios
operativos.

**Consecuencia**: no hay forma de que una operación crítica ocurra sin su evento, ni de alterar el evento
después. La redacción de datos sensibles se aplica antes de persistir.

### D10 — Sin borrado físico en entidades críticas

**Decisión**: relaciones laborales, liquidaciones, recibos, pagos y auditoría no se borran. Los estados
terminales (`ARCHIVED`, `CLOSED`, `REVOKED`) reemplazan al `DELETE`.

**Motivo**: exigencia del encargo, y consecuencia de la retención legal aún indefinida (OD-10). Borrar
algo cuyo plazo de conservación no se conoce es irreversible; conservarlo no lo es.

**Consecuencia**: el esquema Prisma no usa `onDelete: Cascade` en esas relaciones. El derecho de supresión
se implementa como flujo con conservación legal documentada (SEG-07).

### D11 — Control de concurrencia optimista en entidades críticas

**Decisión**: columna `version` en toda entidad crítica; conflicto → HTTP 409. Para el cierre de período,
además un lock distribuido en Redis por `payrollPeriodId`.

**Motivo**: dos usuarios legítimos (familia y contador) trabajan sobre el mismo período al mismo tiempo.
Sin control, la última escritura gana silenciosamente sobre una decisión ajena.

### D12 — Idempotencia en todo lo que se puede reintentar

**Decisión**: `clientIdempotencyKey` en fichajes (generado por el cliente, único por relación),
`Idempotency-Key` HTTP en pagos con respuesta cacheada, deduplicación por `providerEventId` en webhooks
futuros, y un motor determinista.

**Motivo**: FIC-03 exige fichaje offline con sincronización posterior; PAG-07 exige prevenir pagos
duplicados; 14.1 exige que pagos y webhooks sean idempotentes.

### D13 — Módulos separados aunque compartan agregado

**Decisión**: `PayrollPeriods`, `PayrollCalculations` y `PayrollVersions` son tres módulos de código, pero
comparten el agregado transaccional `PayrollPeriod`.

**Motivo**: el encargo pide los tres módulos; el dominio requiere una sola unidad de consistencia
(INV-PAY-03). Separar la responsabilidad de código sin separar la consistencia satisface ambos.

**Consecuencia**: registrada también como OD-14. La separación es de responsabilidad, no de transacción.

### D14 — El marketplace no existe todavía

**Decisión**: sin módulo, sin tablas, sin código. Sólo el flag `FEATURE_MARKETPLACE` reservado.

**Motivo**: el documento lo ubica en v1.2 y el encargo lo excluye del primer sprint. Un stub que aparente
funcionar es peor que su ausencia: invita a construir sobre algo que no existe.

## Alternativas consideradas y descartadas

| Alternativa | Por qué no |
| --- | --- |
| Microservicios desde el inicio | El documento lo desaconseja. Introduce transacciones distribuidas donde el dominio pide atomicidad. Costo operativo alto para un producto sin validar |
| Event sourcing para liquidaciones | Aporta auditabilidad que ya se obtiene con versiones inmutables + auditoría append-only, a un costo de complejidad mucho mayor |
| `float`/`number` para importes | Prohibido por 14.1 y RN-13. Produce errores que sólo aparecen en producción y con dinero real |
| Parámetros normativos en código | Viola RN-01, RN-14 y ADM-02. Obligaría a desplegar ante cada cambio normativo |
| Scraping del portal de ARCA | Prohibido por 3.3 y por el principio 6 del encargo |
| Custodia de salario en cuenta de plataforma | Prohibido por 13.3 y por los principios 3 y 4. Riesgo regulatorio alto y evitable |
| GraphQL | REST + OpenAPI es lo que pide NFR-10, y encaja mejor con la generación desde Zod |
| Simular el conector oficial de ARCA con datos falsos | Viola la regla de no simular funcionalidad futura. Un error explícito es información; un dato falso es una trampa |

## Consecuencias

**Positivas**
- El motor de liquidación se puede probar exhaustivamente sin infraestructura.
- Recalcular una liquidación histórica es reproducible por construcción.
- Los principios legales del encargo son verificables en CI, no promesas del README.
- Cambiar de conector ARCA o de proveedor de pagos no toca el dominio.
- Un cambio normativo es una operación de datos con doble control.

**Negativas y costos aceptados**
- El monorepo tiene una curva de arranque mayor que un repositorio único plano.
- La disciplina de `Money` y string decimal en JSON obliga a formatear en el cliente y es fácil de
  olvidar; se compensa con reglas de lint.
- Los permisos por objeto exigen escribir y probar una policy por recurso: más código, menos accidentes.
- Sin parámetros oficiales, el motor sólo puede validarse contra fixtures hasta que un contador
  matriculado cargue los valores reales. Esto es una limitación **declarada**, no un defecto oculto.

## Verificación

Estas decisiones se verifican automáticamente en CI (detalle en `docs/security-model.md` §12):

| Decisión | Control |
| --- | --- |
| D3 | `payroll-engine` no importa Prisma, Nest, Next ni IO de `node:` |
| D4 | Sin `parseFloat`/`Number()`/aritmética nativa en rutas de dinero |
| D6 | `apps/api` no depende de Puppeteer / Selenium / Playwright |
| D6, D7 | Los conectores deshabilitados lanzan error controlado; test por operación |
| D9 | Test de integración: la operación crítica y su `AuditEvent` viven o mueren juntos |
| Principio 5 | Ningún identificador del árbol contiene patrones de clave fiscal |
