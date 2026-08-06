# Estrategia de integración con ARCA

> Deriva de la sección 7.7 (ARC-01..ARC-12), 11.1 y 14.1 del documento de requerimientos.
> **No confirma ni supone** la existencia de una API pública de Casas Particulares ni la delegabilidad
> del servicio. Ambos puntos requieren validación formal con ARCA (`docs/open-decisions.md`, OD-03).

## 1. El hecho de partida

El documento es explícito en su sección 5:

> "El catálogo público consultado no publica un web service específico de Casas Particulares. Debe
> existir un flujo asistido que no dependa de una API."

Y en su control de documento:

> "El documento no confirma que el servicio 'Personal de Casas Particulares' sea delegable ni que exista
> una API pública específica; ambos puntos requieren validación formal con ARCA."

Por lo tanto el diseño **no trata el camino asistido como un fallback temporal**. Es el camino principal
del producto. Una eventual API oficial sería una optimización, no un rescate.

## 2. Lo que la plataforma hace y lo que no

| La plataforma **sí**                                     | La plataforma **no**                                        |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| Calcula una preliquidación explicada                     | Emite el recibo de sueldo                                   |
| Prepara los valores exactos que la familia debe informar | Ingresa esos valores por la familia                         |
| Abre ARCA mediante un enlace al dominio oficial          | Embebe, imita o proxea el login de ARCA                     |
| Registra el estado de una delegación de servicio         | Almacena la clave fiscal del usuario                        |
| Importa el PDF oficial, lo valida y lo concilia          | Genera un PDF que parezca un recibo oficial                 |
| Mantiene checklist, vencimientos y evidencia             | Automatiza el portal (scraping, robots, ingeniería inversa) |

Estas líneas se derivan de los principios 5, 6, 7 y 8 del encargo, y de ARC-03, ARC-04 y SEG-06.

## 3. El puerto `ARCAConnector`

Interfaz única, en `packages/domain`. Todo el resto del sistema depende de ella y de ninguna
implementación concreta.

```typescript
export interface ARCAConnector {
  readonly kind: 'MANUAL_ASSISTED' | 'OFFICIAL';

  getRelationshipStatus(input: GetRelationshipStatusInput): Promise<RelationshipStatusResult>;
  getObligations(input: GetObligationsInput): Promise<ObligationsResult>;
  createReceipt(input: CreateReceiptInput): Promise<CreateReceiptResult>;
  downloadReceipt(input: DownloadReceiptInput): Promise<DownloadReceiptResult>;
  validateReceipt(input: ValidateReceiptInput): Promise<ValidateReceiptResult>;
}
```

Los tipos se refinan durante el diseño (el encargo indica `unknown` como punto de partida). La forma
prevista de cada uno:

| Operación               | Entrada                                 | Salida en el conector manual                                                                                 |
| ----------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `getRelationshipStatus` | `{ employmentRelationshipId }`          | Estado **declarado** por la familia + fecha de última confirmación + checklist de alta (ARC-02)              |
| `getObligations`        | `{ employmentRelationshipId, period }`  | Obligaciones derivadas de la preliquidación y del calendario de vencimientos configurado (ARC-01)            |
| `createReceipt`         | `{ payrollPeriodId, payrollVersionId }` | **No crea nada.** Devuelve una `ARCATask` con checklist, los valores a informar y el enlace oficial (ARC-04) |
| `downloadReceipt`       | `{ arcaDocumentId }`                    | URL firmada del PDF **previamente importado** por el usuario. Nunca descarga de ARCA                         |
| `validateReceipt`       | `{ arcaDocumentId, payrollVersionId }`  | Resultado de validación de formato + metadatos + comparación contra la preliquidación (ARC-05..ARC-07)       |

`createReceipt` es el nombre que fija el encargo. Su semántica en el conector manual es "**preparar** la
emisión", no "emitir". El tipo de retorno lo deja explícito: devuelve una tarea, no un documento.

## 4. `ManualAssistedARCAConnector` — la implementación del MVP

Activa por defecto. **No realiza ninguna llamada de red hacia ARCA.**

### Qué administra

1. **Checklist** por tipo de tarea (alta de relación, emisión de recibo, pago de aportes), con pasos
   ordenados, cada uno marcable con fecha y actor.
2. **Datos que la familia debe ingresar** — la pantalla presenta los valores calculados en formato
   copiable, campo por campo, con la etiqueta que usa el formulario oficial (ARC-04).
3. **Tareas pendientes** con vencimiento, responsable (familia o contador) y estado: pendiente, en
   proceso, cumplida, observada, vencida (ARC-01).
4. **Enlaces oficiales configurables** — administrados como contenido, con propietario y fecha de
   revisión (ADM-07), de modo que un cambio de URL en ARCA no requiera desplegar código. El enlace se
   abre en el navegador del sistema, mostrando el dominio, y **nunca dentro de un webview** (ARC-03).
5. **Carga del PDF** — importación del recibo oficial emitido en ARCA (ARC-05).
6. **Lectura de metadatos** — número de páginas, fecha de creación, texto extraíble, y el QR público
   del recibo cuando esté presente (ARC-06). La lectura del QR es **lectura de un archivo que el usuario
   subió**; no es una consulta automatizada al portal.
7. **Validación de formato** — MIME real, tamaño, legibilidad, `sha256`.
8. **Asociación con el período** — el documento queda vinculado a `payrollPeriodId` y `payrollVersionId`.
9. **Comparación con la preliquidación** — concepto por concepto (ARC-07).
10. **Registro de diferencias** — cada diferencia se clasifica y **bloquea la conciliación** hasta resolverse.
11. **Conciliación** — cuando no quedan diferencias abiertas, el período avanza.
12. **Auditoría** — cada paso del checklist, cada importación y cada resolución de diferencia generan evento.

### Clasificación de diferencias (ARC-07)

| Clase              | Ejemplo                                                    | Efecto                                              |
| ------------------ | ---------------------------------------------------------- | --------------------------------------------------- |
| `NONE`             | Coincidencia exacta                                        | Permite conciliar                                   |
| `ROUNDING`         | Diferencia dentro de la tolerancia de redondeo configurada | Se registra, permite conciliar con nota             |
| `CONCEPT_MISMATCH` | Un concepto presente en uno y ausente en el otro           | Bloquea                                             |
| `AMOUNT_MISMATCH`  | Mismo concepto, importe distinto fuera de tolerancia       | Bloquea                                             |
| `PERIOD_MISMATCH`  | El recibo corresponde a otro período                       | Bloquea                                             |
| `PARTY_MISMATCH`   | CUIL de empleador o trabajadora no coincide                | Bloquea                                             |
| `UNREADABLE`       | El PDF no permite extraer datos                            | Bloquea; exige carga manual asistida de los valores |

Una diferencia bloqueante se resuelve de dos maneras: corrigiendo la preliquidación (lo que genera una
rectificativa, RN-06) o registrando una justificación autorizada con evidencia. Ambas quedan auditadas.

## 5. `OfficialARCAConnector` — el adaptador vacío

Existe, está registrado, y **falla de manera controlada**:

```typescript
export class OfficialARCAConnector implements ARCAConnector {
  readonly kind = 'OFFICIAL' as const;

  private notEnabled(operation: string): never {
    throw new ARCAIntegrationNotEnabledError(operation);
  }

  getRelationshipStatus() {
    return this.notEnabled('getRelationshipStatus');
  }
  getObligations() {
    return this.notEnabled('getObligations');
  }
  createReceipt() {
    return this.notEnabled('createReceipt');
  }
  downloadReceipt() {
    return this.notEnabled('downloadReceipt');
  }
  validateReceipt() {
    return this.notEnabled('validateReceipt');
  }
}
```

`ARCAIntegrationNotEnabledError` se mapea a HTTP 501 con un mensaje explícito: la integración oficial no
está habilitada. **No devuelve datos simulados.** Un flag apagado no puede parecer un flag encendido.

La resolución del conector:

```typescript
provide: ARCA_CONNECTOR,
useFactory: (config: AppConfig) =>
  config.FEATURE_ARCA_OFFICIAL_CONNECTOR
    ? new OfficialARCAConnector()
    : new ManualAssistedARCAConnector(/* deps */),
```

## 6. Condiciones para habilitar el conector oficial

El flag `FEATURE_ARCA_OFFICIAL_CONNECTOR` no se enciende hasta que **todas** se cumplan:

1. ARCA publica (o autoriza por convenio) un servicio aplicable a Casas Particulares.
2. Existe autorización contractual formal para usarlo.
3. Se completó la homologación en el ambiente de pruebas de ARCA.
4. Certificados, endpoints y registros están **segregados** entre homologación y producción (ARC-12).
5. Los certificados viven en el gestor de secretos del backend, nunca en el repositorio ni en clientes (11.1).
6. La integración implementa idempotencia, reintentos controlados, trazas y correlación de solicitudes (11.1).
7. Se registró una ADR con la decisión, el alcance y el plan de rollback.

Mientras tanto: el flag queda en `false` en todos los entornos, incluido producción.

## 7. Delegación al contador (ARC-09, CON-04)

Cuando la familia delega un servicio en ARCA, la plataforma registra el **estado del trámite**:

```
ARCADelegation {
  id,
  employmentRelationshipId,
  accountantId,
  serviceName,              // nombre del servicio delegado en ARCA
  representedCuil,          // CUIL del representado (empleador)
  authorizedCuil,           // CUIL del autorizado (contador)
  grantedAt,
  validUntil?,
  revokedAt?,
  status,                   // PENDING | ACTIVE | REVOKED | EXPIRED
  evidenceDocumentId?,      // constancia que el usuario adjunta
  version
}
```

Lo que **no** contiene: clave fiscal, cookies, tokens de sesión de ARCA, ni ningún medio de acceder al
portal en nombre de nadie.

El contador no puede marcar una tarea como operable sin una delegación en estado `ACTIVE` verificada
(CON-04). Si el servicio resulta **no delegable** — riesgo identificado en la sección 18 del documento —
el flujo alternativo de ARC-10 aplica: el contador revisa y prepara, y la familia ejecuta la operación
oficial con su propia clave. La arquitectura soporta ambos caminos sin cambios de modelo: cambia el
responsable de la `ARCATask`, no su estructura.

## 8. Modelo de datos de cumplimiento

```
ARCATask {
  id, employmentRelationshipId, payrollPeriodId?,
  type,                     // RELATIONSHIP_REGISTRATION | RECEIPT_ISSUANCE |
                            // CONTRIBUTION_PAYMENT | RECTIFICATION
  status,                   // PENDING | IN_PROGRESS | COMPLETED | OBSERVED | OVERDUE
  assigneeRole,             // FAMILY_EMPLOYER | ACCOUNTANT
  assigneeUserId?,
  dueDate,
  checklist: ARCAChecklistItem[],
  preparedValues,           // JSON: los valores a informar, ya calculados
  officialLinkKey,          // clave del enlace en el catálogo de contenido
  completedAt?, completedByUserId?,
  createdAt, updatedAt, createdByUserId, version
}

ARCAChecklistItem {
  id, arcaTaskId, order, label, helpText,
  completedAt?, completedByUserId?
}

ARCADocument {
  id, employmentRelationshipId, payrollPeriodId, payrollVersionId,
  documentId,               // FK a Documents (el archivo vive en object storage)
  kind,                     // OFFICIAL_RECEIPT | CONTRIBUTION_PROOF | ART_PROOF | OTHER
  sha256,
  extractedMetadata,        // JSON: lo que se pudo leer del PDF
  qrPayload?, qrVerifiedAt?,
  validationStatus,         // PENDING | VALID | INVALID | UNREADABLE
  validationDetails,
  importedAt, importedByUserId, version
}

ReceiptComparison {
  id, arcaDocumentId, payrollVersionId,
  differences: ReceiptDifference[],   // clase, concepto, esperado, encontrado, delta
  blocking: boolean,
  resolvedAt?, resolvedByUserId?, resolutionNote?
}
```

## 9. Lo que se prueba en esta etapa

| Prueba                                                 | Verifica                                                                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| `ManualAssistedARCAConnector` genera la tarea correcta | `createReceipt` devuelve checklist + valores preparados, no un documento    |
| El conector manual no hace red                         | Ninguna llamada saliente durante los tests (fetch interceptado)             |
| `OfficialARCAConnector` lanza el error controlado      | Las cinco operaciones lanzan `ARCAIntegrationNotEnabledError`               |
| Resolución por feature flag                            | Con el flag encendido se resuelve el oficial; apagado, el manual            |
| Importación de recibo                                  | MIME real validado, `sha256` calculado, vinculación al período              |
| Comparación                                            | Cada clase de diferencia se detecta y su carácter bloqueante es el esperado |
| Conciliación bloqueada                                 | No se puede conciliar con diferencias abiertas                              |
| Auditoría                                              | Importación y resolución de diferencia generan `AuditEvent`                 |

## 10. Riesgos específicos de este módulo

| Riesgo                               | Mitigación en el diseño                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| ARCA nunca publica una API aplicable | El camino asistido es completo por sí mismo. No hay funcionalidad que dependa de la API                               |
| El servicio no es delegable          | ARC-10: el contador prepara y revisa, la familia ejecuta. Mismo modelo de datos                                       |
| Cambian las URLs del portal          | Enlaces como contenido administrable (ADM-07), no constantes de código                                                |
| Cambia el formato del PDF del recibo | La extracción de metadatos es _best effort_; si falla, `UNREADABLE` y carga manual asistida. Nunca se inventa un dato |
| Presión por automatizar el portal    | Prohibición explícita en este documento, verificada en CI (`no-browser-automation`)                                   |
| ARCA caído durante el cierre         | Fichaje y preliquidación no dependen de ARCA (14.1). La tarea queda pendiente                                         |
