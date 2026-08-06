# Decisiones abiertas, inconsistencias y riesgos

> Consolida la sección 19 del documento de requerimientos con lo que surgió al contrastar el documento
> contra el encargo de implementación.
> Cada entrada dice **quién decide**, **qué bloquea** y **qué se hizo mientras tanto**.

## Cómo leer el estado de bloqueo

| Estado | Significado |
| --- | --- |
| 🟢 No bloquea | El desarrollo avanza con un supuesto reversible y documentado |
| 🟡 Bloquea una fase | Se puede construir la base, pero una fase concreta no cierra sin la respuesta |
| 🔴 Bloquea el lanzamiento | No impide programar, impide salir a producción con usuarios reales |

**Ninguna decisión abierta es 🔴 para la Etapa 2.** La base técnica arranca sin esperar respuestas.

---

## A. Decisiones del documento (sección 19)

### OD-01 — Mercado inicial 🟢
**Definición necesaria**: Córdoba Capital, provincia o lanzamiento nacional.
**Impacto técnico**: bajo. Afecta zonas horarias por domicilio (ya soportado, NFR-08), jurisdicción del
contador (`Accountant.jurisdiction`, ya modelado) y eventual zona desfavorable.
**Mientras tanto**: el modelo soporta múltiples jurisdicciones desde el inicio. No se hardcodea Córdoba.
**Decide**: negocio.

### OD-02 — Marca y posicionamiento 🟢
**Definición necesaria**: administración laboral primero o marketplace primero.
**Estado**: el documento **ya recomienda** administración primero, y el encargo lo confirma. Se toma como
decidido: administración primero, marketplace en v1.2.
**Mientras tanto**: marketplace fuera del sprint 1, sin código simulado.
**Decide**: resuelto por el documento y el encargo.

### OD-03 — Delegabilidad y API de ARCA 🟡 (bloquea E8)
**Definición necesaria**: confirmar por prueba y consulta formal si el servicio "Personal de Casas
Particulares" es delegable, y si existen integraciones no públicas.
**Impacto técnico**: alto si la respuesta cambia el responsable de la tarea ARCA.
**Mientras tanto**: `ManualAssistedARCAConnector` cubre ambos escenarios. Si el servicio **no** es
delegable, aplica ARC-10 (el contador prepara, la familia ejecuta) y sólo cambia el `assigneeRole` de la
`ARCATask`, no el modelo. El conector oficial existe deshabilitado.
**Decide**: consulta formal a ARCA + asesoría legal. Se valida empíricamente en el piloto (E8).

### OD-04 — Modelo de contadores 🟢
**Definición necesaria**: asociados independientes, estudio propio o combinación.
**Impacto técnico**: medio. Determina si `ACCOUNTANT_MANAGER` administra un estudio con cartera propia o
si la plataforma asigna centralmente.
**Mientras tanto**: se modela la forma más general — `Accountant` pertenece opcionalmente a un
`AccountingFirm`; `ProfessionalAssignment` vincula contador ↔ relación laboral. Ambos modelos caben.
**Decide**: negocio.

### OD-05 — Proveedor de pagos 🟡 (bloquea E7)
**Definición necesaria**: banco o PSP, experiencia de consentimiento, modelo de conciliación.
**Impacto técnico**: acotado por diseño. `PaymentProvider` es un puerto; el MVP usa
`ManualTransferProvider`, que no requiere proveedor alguno.
**Restricción no negociable**: el proveedor debe estar registrado o autorizado por el BCRA para la
función utilizada (F10, PAG-03), y el dinero **nunca** pasa por una cuenta de la plataforma.
**Mientras tanto**: registro manual de transferencia con comprobante. Es un camino completo, no un stub.
**Decide**: negocio + asesoría regulatoria.

### OD-06 — Proveedor de identidad 🟢
**Definición necesaria**: proveedor, costo, documentos admitidos, política de retención.
**Impacto técnico**: bajo. PER-03 admite "proveedor **o revisión interna**".
**Mientras tanto**: verificación manual interna. `IdentityVerification` guarda estado, fecha y proveedor,
no la exposición pública de documentos. La verificación automática está fuera del primer sprint.
**Decide**: negocio + privacidad.

### OD-07 — Método de fichaje por defecto 🟢
**Definición necesaria**: QR, PIN o proximidad; reglas de offline y tolerancia.
**Impacto técnico**: bajo. FIC-02 exige soportar los tres y que **la familia elija**.
**Mientras tanto**: los tres se implementan; el valor por defecto es configuración, no código. La
tolerancia y el redondeo son parámetros por relación (FIC-04).
**Decide**: producto, validado en el piloto.

### OD-08 — Precios y reparto con profesionales 🟢
**Definición necesaria**: planes de autogestión, revisión y administración completa; reparto.
**Impacto técnico**: bajo para la base. `Subscription` y `Plan` se modelan con límites y beneficios
configurables; ADM-03 exige que un cambio de precio no altere retroactivamente contratos vigentes.
**Mientras tanto**: modelo de planes genérico, sin precios cargados.
**Decide**: negocio.

### OD-09 — Responsabilidad y seguro 🔴 (bloquea lanzamiento)
**Definición necesaria**: seguro profesional, límites contractuales, protocolo de errores y reclamos.
**Impacto técnico**: bajo en código, alto en textos legales y en el flujo de rectificación.
**Mientras tanto**: el flujo de rectificación existe (RN-06, LIQ-13) y todo queda auditado. Los textos
contractuales no son parte de este repositorio.
**Decide**: asesoría legal + negocio. Riesgo identificado en la sección 18 del documento.

### OD-10 — Matriz de retención 🟡 (bloquea E7)
**Definición necesaria**: plazos para documentos laborales, mensajes, fichajes, auditoría y cuentas cerradas.
**Impacto técnico**: medio. Determina la política de `Document.retentionPolicy` y el alcance real del
derecho de supresión (SEG-07).
**Mientras tanto**: cada documento lleva un campo `retentionPolicy` con valor `PENDING_LEGAL_DEFINITION`.
No se borra nada. La supresión de cuenta desactiva el acceso pero conserva lo que la ley pueda exigir.
**Decide**: asesoría legal.

### OD-11 — Soporte 🟢
**Definición necesaria**: horarios, canales, SLA, tratamiento de casos críticos.
**Impacto técnico**: bajo. `support` modela tickets con categoría, prioridad, responsable y escalamiento.
**Mientras tanto**: SLA configurable, sin valores cargados.
**Decide**: operaciones.

### OD-12 — Marketplace 🟢
**Definición necesaria**: nivel de verificación, garantía, criterios de moderación.
**Impacto técnico**: nulo en esta etapa. Fuera del primer sprint por decisión explícita.
**Mientras tanto**: sin módulo, sin tablas, sin código simulado. Sólo el flag `FEATURE_MARKETPLACE` reservado.
**Decide**: producto, en v1.2.

---

## B. Inconsistencias y ambigüedades detectadas al contrastar el documento con el encargo

### OD-13 — Roles del documento que el encargo no enumera 🟢
El documento (sección 4) define **Verificador** y **Auditor / cumplimiento**. El encargo lista siete
roles y ninguno es esos dos.
**Interpretación adoptada**: *Verificador* pertenece al marketplace y a la verificación de identidad,
ambos fuera del primer sprint — no se crea el rol todavía. *Auditor / cumplimiento* se cubre inicialmente
con `PLATFORM_ADMIN` en modo lectura sobre `audit_event`, que ADM-08 exige inmutable para usuarios
operativos. Si se necesita separación de funciones real, se agrega `COMPLIANCE_AUDITOR` como rol de sólo
lectura sin coste de rediseño.
**Confirmar con**: producto.

### OD-14 — Alcance de "PayrollVersions" como módulo separado 🟢
El encargo pide módulos `PayrollCalculations`, `PayrollPeriods` y `PayrollVersions` por separado, pero en
el dominio una versión es parte del agregado `PayrollPeriod` (INV-PAY-03).
**Interpretación adoptada**: se respetan los tres módulos como unidades de código (controlador, servicio,
casos de uso propios: rectificación, comparación de versiones, historial), pero comparten el agregado
transaccional. La separación es de responsabilidad, no de consistencia.
**Confirmar con**: nadie — decisión técnica registrada aquí y en la ADR 0001.

### OD-15 — RPO/RTO 🟡 (bloquea E7)
NFR-05 exige "objetivos RPO/RTO aprobados por negocio" pero no los define.
**Mientras tanto**: backups diarios automáticos con prueba de restauración. Los objetivos formales
quedan pendientes.
**Decide**: negocio + infraestructura.

### OD-16 — Plataforma de despliegue de producción 🟢
Ni el documento ni el encargo la definen. El encargo sólo exige Docker Compose para desarrollo local.
**Mientras tanto**: la aplicación se empaqueta en contenedores y no depende de ningún servicio propietario
de un proveedor. La decisión se puede tomar tarde sin costo.
**Decide**: infraestructura, antes de E7.

### OD-17 — "createReceipt" en el puerto ARCA 🟢
El encargo define `createReceipt` en `ARCAConnector`, pero el principio 7 establece que **el recibo se
genera en ARCA** y la plataforma nunca lo emite.
**Interpretación adoptada**: se conserva el nombre del encargo y se documenta su semántica: en el
conector manual, `createReceipt` **prepara** la emisión y devuelve una `ARCATask` con checklist y valores
a informar. El tipo de retorno hace explícito que no devuelve un documento. Registrado en
`docs/arca-integration-strategy.md` §3.
**Confirmar con**: nadie — decisión documentada.

### OD-18 — Zona desfavorable 🟡 (bloquea E4)
El documento y el encargo mencionan "zona desfavorable cuando corresponda" sin definir criterio ni valor.
**Mientras tanto**: el motor acepta `unfavorableZone` como entrada y el parámetro normativo define si
aplica y con qué regla. Sin valores cargados: no se inventa un porcentaje.
**Decide**: contador matriculado, al cargar los parámetros oficiales.

### OD-19 — Catálogo de categorías laborales 🟡 (bloquea E4)
LIQ-03 exige que el catálogo se administre "sin desplegar una nueva versión de la app", pero el documento
no lista las categorías.
**Mientras tanto**: `WorkerCategory` es una tabla administrable, no un enum. Los seeds cargan categorías
ficticias marcadas como tales.
**Decide**: contador matriculado.

### OD-20 — Alcance de la revisión profesional obligatoria 🟢
LIQ-08 dice que el sistema "admite revisión obligatoria por profesional en casos complejos" sin definir
qué es un caso complejo.
**Interpretación adoptada**: `requiresProfessionalReview` es una regla configurable por plan y por tipo
de período (liquidación final, rectificativa, vacaciones y aguinaldo como candidatos por defecto). La
transición `CALCULATED → PENDING_PROFESSIONAL_REVIEW` la consulta.
**Confirmar con**: contador + producto.

---

## C. Riesgos

### C.1 Riesgos regulatorios

| # | Riesgo | Impacto | Mitigación en el diseño |
| --- | --- | --- | --- |
| R-01 | El servicio no es delegable al contador | Alto | ARC-10: flujo alternativo con el mismo modelo de datos. Se valida en el piloto |
| R-02 | Nunca existe una API de Casas Particulares | Alto | El camino asistido es completo por sí mismo, no un fallback |
| R-03 | La plataforma es percibida como empleadora | Alto | Sin entidades ni endpoints de dirección laboral. Toda decisión requiere actor familia. Textos contractuales (fuera de este repo) |
| R-04 | Riesgo regulatorio en pagos | Alto | El dinero nunca pasa por la plataforma. `ManualTransferProvider` en el MVP. PSP habilitado por BCRA cuando exista (OD-05) |
| R-05 | Cambios normativos frecuentes | Alto | Parámetros versionados en base, servidos por API. RN-14: cambios sin actualizar las apps |
| R-06 | Error en una liquidación con consecuencia legal | Alto | Motor puro y probado, doble control de parámetros, rectificativas, auditoría, y la advertencia de que los valores actuales son fixtures |
| R-07 | Retención de datos mal definida | Medio | Sin borrado físico; `retentionPolicy` explícita pendiente de definición legal (OD-10) |
| R-08 | Ejercicio profesional fuera de jurisdicción | Medio | Verificación de matrícula con jurisdicción y vigencia antes de habilitar (CON-02) |

### C.2 Riesgos técnicos

| # | Riesgo | Impacto | Mitigación |
| --- | --- | --- | --- |
| T-01 | Uso accidental de `float` para dinero | Alto | `Money` con decimal exacto, `NUMERIC(18,4)`, regla de lint, importes como string en JSON |
| T-02 | Filtración de CBU/CVU en logs o respuestas | Alto | Cifrado a nivel de aplicación, `MaskedAccount` como única representación expuesta, redactor en el logger |
| T-03 | Fichajes duplicados por reintento offline | Alto | `clientIdempotencyKey` único por relación, verificado en base |
| T-04 | Pago duplicado | Alto | `Idempotency-Key` + `IdempotencyRecord` con respuesta cacheada |
| T-05 | Condición de carrera en el cierre de período | Alto | Lock distribuido en Redis + versión optimista; conflicto → 409 |
| T-06 | Un recálculo altera una liquidación histórica | Alto | `PayrollParameterVersion` inmutable y referenciada; test de regresión normativa |
| T-07 | El motor se contamina con dependencias de IO | Medio | Verificación en CI: `payroll-engine` no importa Prisma, Nest, Next ni módulos de `node:` con IO |
| T-08 | Alguien agrega scraping "temporalmente" | Medio | Verificación en CI: `apps/api` no declara Puppeteer/Selenium/Playwright |
| T-09 | Aparece un campo de clave fiscal | Alto | Verificación en CI que busca el patrón en todo el árbol |
| T-10 | El esquema Prisma permite borrado físico donde no debe | Alto | Sin `onDelete: Cascade` en relaciones, liquidaciones, recibos, pagos ni auditoría; revisión en code review |
| T-11 | Auditoría modificable | Alto | `INSERT`/`SELECT` únicamente para el rol de aplicación sobre `audit_event` |
| T-12 | Deriva entre el esquema Zod y OpenAPI | Medio | OpenAPI se genera **desde** los esquemas Zod; test de contrato |
| T-13 | El fichaje offline pierde datos | Medio | Cola local persistente; el servidor guarda hora declarada **y** hora de recepción |
| T-14 | Crecimiento del monolito sin límites reales | Medio | Grafo de dependencias verificado por pnpm + reglas de import en ESLint |

---

## D. Preguntas concretas para el equipo

Ordenadas por urgencia real, no por posición en el documento.

**Antes del piloto (E8)**
1. ¿Se hizo la consulta formal a ARCA sobre delegabilidad del servicio? ¿Hay respuesta escrita? *(OD-03)*
2. ¿Hay un contador matriculado asignado que vaya a cargar y aprobar los parámetros normativos reales?
   Sin esa persona, el motor sólo puede operar con fixtures. *(OD-18, OD-19)*
3. ¿Qué plazos de retención aplican a documentos laborales, fichajes y auditoría? *(OD-10)*
4. ¿Qué cobertura de responsabilidad existe ante un error de liquidación? *(OD-09)*

**Antes de E5 (contador)**
5. ¿Contadores asociados independientes, estudio propio, o ambos? *(OD-04)*
6. ¿Qué casos exigen revisión profesional obligatoria? *(OD-20)*

**Antes de E7 (endurecimiento)**
7. ¿Qué PSP o banco, y con qué modelo de consentimiento? *(OD-05)*
8. ¿Qué RPO y RTO aprueba negocio? *(OD-15)*
9. ¿Dónde se despliega producción? *(OD-16)*

**Puede esperar**
10. ¿Mercado inicial? *(OD-01)* — el modelo ya es multi-jurisdicción.
11. ¿Estructura de planes y precios? *(OD-08)*
12. ¿Se necesita un rol `COMPLIANCE_AUDITOR` separado? *(OD-13)*
