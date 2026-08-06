# Modelo de seguridad y privacidad

> Deriva de la sección 13 del documento de requerimientos (Seguridad, privacidad y cumplimiento),
> de los requerimientos SEG-01..SEG-08 y de las reglas RN-09, RN-10.
> **No reemplaza un dictamen de un especialista en privacidad ni una evaluación de impacto formal.**

## 1. Los cinco límites duros

Antes que cualquier control técnico, cinco cosas que el sistema **no hace**, verificables por inspección
del código:

1. **No existe campo, DTO, log, columna ni variable de entorno que reciba o guarde una clave fiscal**
   (SEG-06, principio 5). Se verifica en CI con un test que busca el patrón en todo el árbol.
2. **No hay scraping ni automatización de navegador contra ARCA** (principio 6). `apps/api` no declara
   Puppeteer, Playwright ni Selenium. La regla se verifica en CI sobre el `package.json`.
3. **No hay cuenta de plataforma que reciba salario** (principios 3 y 4). No existen entidades `Wallet`,
   `Balance` ni `LedgerAccount` para fondos salariales.
4. **No hay SDK publicitarios** en web ni móvil, ni eventos analíticos con datos laborales o financieros
   (sección 15 del documento).
5. **No hay seguimiento continuo de ubicación** (FIC-09, principio 15). La ubicación se solicita
   únicamente en el momento del fichaje.

## 2. Autenticación

| Control | Implementación | Requerimiento |
| --- | --- | --- |
| Registro | Correo o teléfono + código de un solo uso; la cuenta no se activa sin validar | SEG-01 |
| Contraseñas | Argon2id, política de longitud mínima, verificación contra listas de contraseñas filtradas | 13.1 |
| MFA | TOTP. Obligatorio para `ACCOUNTANT`, `ACCOUNTANT_MANAGER`, `PLATFORM_ADMIN`, `OPERATIONS_AGENT`, `SUPPORT_AGENT` y para operaciones críticas | SEG-02 |
| Sesiones | Access token corto (15 min) + refresh token rotativo con detección de reutilización | SEG-05 |
| Revocación | Lista de sesiones activas por usuario, revocables individualmente o en bloque | SEG-05 |
| Credential stuffing | Rate limit por IP y por identidad, backoff progresivo, bloqueo temporal, alerta a partir de un umbral | 13.1 |
| Dispositivos nuevos | Notificación al usuario y registro en auditoría | 13.1 |

**Rotación de refresh tokens**: cada uso emite uno nuevo e invalida el anterior. Si llega un refresh
token ya consumido, se invalida toda la familia de tokens de esa sesión y se alerta — es la señal
clásica de un token robado.

## 3. Autorización

Dos capas obligatorias, descritas en `docs/architecture.md` sección 6. Aquí, la matriz de permisos
que traduce la sección 4.1 del documento de requerimientos.

| Acción | `FAMILY_EMPLOYER` | `WORKER` | `ACCOUNTANT` | Interno |
| --- | --- | --- | --- | --- |
| Ver relación laboral | Sí (las propias) | Sí (las propias) | Sólo asignadas | Soporte: lectura con ticket |
| Editar condiciones | Sí | Solicita | Asiste (observa) | No |
| Fichar | Consulta | Sí | No | No |
| Aprobar horas | Sí | Acepta / objeta | Consulta | No |
| Generar preliquidación | Sí | Consulta | Sí | No |
| Aprobar liquidación | Sí | Consulta | Revisa (aprueba u observa) | No |
| Operar ARCA | Sí | No | Sólo si delegación verificada | No |
| Registrar pago | Sí | Confirma recepción | Consulta | No |
| Modificar parámetros legales | No | No | Propone | `PLATFORM_ADMIN` con doble control |

`ACCOUNTANT_MANAGER` añade sobre `ACCOUNTANT`: ver la cartera del estudio y reasignar tareas por capacidad
(CON-05, CON-13). No añade acceso a relaciones fuera del estudio.

### Acceso administrativo excepcional

Un `PLATFORM_ADMIN` que necesite ver una relación concreta debe abrir un acceso excepcional con:
motivo obligatorio, vencimiento explícito, alcance acotado a un recurso, y `AuditEvent` en el momento
de abrirlo y en cada lectura realizada bajo ese acceso (13.1). El acceso expira solo.

## 4. Datos sensibles y cifrado

| Dato | Tratamiento |
| --- | --- |
| CBU / CVU | Cifrado a nivel de aplicación (AES-256-GCM, clave desde el gestor de secretos). **Nunca** se devuelve completo: sólo `MaskedAccount { last4, kind }`. Prohibido en logs. |
| DNI / CUIL | Cifrado en reposo a nivel de campo. Se expone sólo a quien la policy autoriza. |
| Documentos de identidad (imágenes) | Object storage privado y cifrado. Retención según OD-10. Nunca públicos. |
| Ubicación de fichaje | Se guarda punto + precisión aproximada, sólo del instante del fichaje. Sin histórico de trayectos. |
| Contraseñas | Argon2id. Nunca reversible. |
| Tokens y secretos | Sólo en gestor de secretos / variables de entorno. Nunca en código, logs ni bundles móviles. |
| Notas profesionales privadas | Visibilidad restringida al contador, separada de las notas compartidas (CON-09). |

### Rotación de claves de cifrado

El campo cifrado guarda el identificador de la clave usada (`keyId`), de modo que rotar la clave no
obliga a re-cifrar todo de inmediato ni rompe los registros históricos.

## 5. Superficie HTTP

| Control | Configuración |
| --- | --- |
| TLS | Obligatorio en tránsito (NFR-01). HSTS. |
| CORS | Lista blanca explícita de orígenes por entorno. Sin `*`. Credenciales sólo a orígenes conocidos. |
| CSRF | Tokens `SameSite=Strict` para los flujos con cookie de sesión en la web. La API móvil usa Bearer y no es susceptible. |
| Headers | `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Permissions-Policy` restrictiva (geolocalización sólo donde el fichaje la usa). |
| Rate limiting | Global por IP, por identidad en autenticación, y específico en endpoints de pago y de subida de archivos. |
| Validación | Todo input pasa por Zod antes de llegar al servicio. Rechazo de campos desconocidos (`strict`). |
| Tamaño de payload | Límite explícito por endpoint. |
| Enumeración | Respuestas uniformes en login y recuperación de cuenta (no revelar si un correo existe). |

## 6. Auditoría

Operaciones que **deben** generar `AuditEvent` (lista del prompt de implementación, alineada con SEG-08):

| # | Operación | Contexto |
| --- | --- | --- |
| 1 | Inicio de sesión relevante (nuevo dispositivo, fallido reiterado, MFA) | Identity |
| 2 | Cambio de permisos o de rol | Users / Administration |
| 3 | Alta o baja de relación laboral | EmploymentRelationships |
| 4 | Cambio de remuneración o de condiciones | EmploymentRelationships |
| 5 | Corrección de fichaje (solicitud, aprobación, rechazo) | AttendanceCorrections |
| 6 | Cierre de período y reapertura | PayrollPeriods |
| 7 | Cálculo y recálculo de liquidación | PayrollCalculations |
| 8 | Revisión profesional (aprobación, observación, devolución) | ProfessionalAssignments |
| 9 | Carga, reemplazo o descarga de documento | Documents |
| 10 | Registro de pago | Payments |
| 11 | Conciliación y resolución de diferencias | Reconciliation |
| 12 | Cambio de CBU o CVU | Workers |
| 13 | Acceso administrativo excepcional (apertura y cada lectura) | Administration |
| 14 | Publicación de una versión de parámetros normativos | PayrollParameters |
| 15 | Alta, vigencia y revocación de una delegación al contador | ProfessionalAssignments |

Forma del evento:

```
AuditEvent {
  id, occurredAt,
  actorUserId, actorRole, onBehalfOfUserId?,
  action,                    // verbo del catálogo, p.ej. PAYROLL_PERIOD_CLOSED
  entityType, entityId,
  before?, after?,           // sólo campos relevantes, ya redactados
  correlationId,
  ipAddress, userAgent, deviceId?
}
```

Garantías:
- **Append-only**: el rol de aplicación de PostgreSQL tiene `INSERT` y `SELECT` sobre `audit_event`;
  `UPDATE` y `DELETE` están revocados (INV-AUD-01, ADM-08).
- **Sin secretos**: `before`/`after` pasan por el mismo redactor que los logs. CBU/CVU aparecen
  enmascarados; contraseñas, tokens y contenido de documentos, nunca (INV-AUD-02).
- **Atomicidad**: para operaciones críticas, el evento se escribe en la misma transacción que el cambio
  de negocio; los efectos externos van por outbox (14.1).

## 7. Privacidad

### 7.1 Minimización

Cada campo personal del esquema debe poder señalar el requerimiento que lo justifica. Los que no
lo tienen no se agregan. En particular, y siguiendo 13.2, **no se almacenan antecedentes penales ni
datos sensibles** sin un análisis legal específico previo (OD-09).

### 7.2 Consentimiento versionado (SEG-04)

```
ConsentDocument { id, kind, version, locale, body, publishedAt }
Consent { id, userId, consentDocumentId, purpose, acceptedAt, ipAddress, deviceId, revokedAt? }
```

Se conserva el **texto exacto** que la persona aceptó, no un puntero a la versión vigente. Finalidades
separadas: términos, privacidad, geolocalización en fichaje, autorización profesional. Cada una
aceptable y revocable por separado.

### 7.3 Derechos del titular (SEG-07, NFR-13)

| Derecho | Implementación |
| --- | --- |
| Acceso | Exportación del legajo completo por relación, con índice (DOC-05) |
| Rectificación | Flujo de corrección con trazabilidad, sin sobrescribir el histórico |
| Supresión | Solicitud de cierre de cuenta que atraviesa un flujo con conservación legal documentada. **No borra** relaciones laborales, liquidaciones, recibos, pagos ni auditoría (retención legal — OD-10) |
| Portabilidad | Exportación en formato legible (PDF/CSV) |

### 7.4 Geolocalización

Se pide en el fichaje, con finalidad informada, y se guarda con la precisión mínima que el método
configurado requiera. La app no declara permisos de ubicación en segundo plano. El fichaje debe poder
completarse con métodos alternativos (QR, PIN) para quien no consienta la ubicación — el requerimiento
FIC-02 lo permite explícitamente y evita que el fichaje se perciba como vigilancia (riesgo de la sección 18).

### 7.5 Analítica

Identificadores seudónimos. Prohibido enviar nombres, DNI, CUIL, CBU, domicilios, recibos, montos
detallados o mensajes a plataformas publicitarias o de analítica de terceros (sección 15).

## 8. Archivos subidos

| Control | Detalle |
| --- | --- |
| Tipo MIME | Validado por **contenido** (magic bytes), no por extensión ni por el header del cliente |
| Formatos admitidos | Lista blanca por tipo de documento (PDF, JPEG, PNG para recibos y comprobantes) |
| Tamaño máximo | Límite por tipo, aplicado en la URL firmada y verificado tras la subida |
| Antivirus | Escaneo asíncrono. El documento no es descargable hasta `scanStatus = CLEAN` (DOC-04) |
| Integridad | `sha256` calculado y persistido; verificable posteriormente (DOC-03) |
| Acceso | URLs firmadas de vida corta. Bucket **nunca** público (DOC-01) |
| Auditoría | Cada descarga genera evento (fila 9 de la tabla de auditoría) |
| Retención | Política por tipo de documento (OD-10) |

## 9. Cadena de suministro y gestión de vulnerabilidades

- **Dependabot** (o equivalente) con actualizaciones agrupadas semanales y de seguridad inmediatas.
- `pnpm audit` en CI, fallando en severidad alta o crítica.
- Lockfile obligatorio; instalación reproducible (`pnpm install --frozen-lockfile`).
- Escaneo de secretos en el repositorio en cada push.
- Pruebas de penetración antes del lanzamiento (13.1) — externo, no incluido en este repositorio.
- Registro de incidentes con clasificación, responsable, evidencia y plazo de notificación (13.1).

## 10. Continuidad

- **Backups** automáticos de PostgreSQL y del object storage, con **prueba de restauración periódica**
  documentada (NFR-05). Un backup no probado no cuenta.
- RPO/RTO a definir con negocio (OD-15).
- **Caída de ARCA**: no bloquea fichaje ni preliquidación (14.1). Las tareas ARCA quedan pendientes.
- **Caída del proveedor de pagos**: el registro manual de transferencia sigue disponible — es el único
  camino del MVP, así que la degradación es natural.
- **Caída de mensajería**: los avisos quedan en la cola con reintentos; los avisos legales críticos se
  reintentan hasta confirmarse.

## 11. Cumplimiento profesional (sección 13.3)

- Matrícula del contador verificada, con jurisdicción y vigencia, antes de habilitar la operación (CON-02).
- Separación de tres vínculos contractuales distintos: contrato de plataforma, carta de encargo
  profesional y relación laboral. No se mezclan ni se facturan juntos (CON-12, RN-09).
- La delegación en ARCA se registra como **estado** (servicio, representado, autorizado, fecha de alta,
  vigencia, revocación) — **jamás la credencial** (ARC-09, CON-04).
- Segregación de funciones: quien configura parámetros normativos no es quien los aprueba (CON-11).

## 12. Verificación automatizada en CI

Controles que fallan el pipeline:

| Control | Qué verifica |
| --- | --- |
| `no-fiscal-credentials` | Ningún identificador del árbol contiene patrones de clave fiscal |
| `no-browser-automation` | `apps/api` no depende de Puppeteer / Selenium / Playwright |
| `no-float-money` | Las rutas de dinero no usan `parseFloat`, `Number()` ni aritmética nativa |
| `no-ad-sdk` | Ningún cliente declara SDK publicitarios |
| `payroll-engine-purity` | `payroll-engine` no importa Prisma, Nest, Next ni `node:fs`/`node:http` |
| `pnpm audit` | Sin vulnerabilidades altas o críticas |
| Escaneo de secretos | Sin credenciales comprometidas en el diff |

Estos controles convierten los principios en una propiedad del build, no en una promesa del README.
