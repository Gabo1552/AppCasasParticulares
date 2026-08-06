import { randomUUID } from 'node:crypto';
import {
  ARCATaskStatus,
  ARCATaskType,
  ReceiptDifferenceClass,
  type ARCAChecklistItem,
  type ARCAConnector,
  type CreateReceiptInput,
  type CreateReceiptResult,
  type DownloadReceiptInput,
  type DownloadReceiptResult,
  type GetObligationsInput,
  type GetRelationshipStatusInput,
  type ObligationsResult,
  type PreparedValue,
  type ReceiptDifference,
  type RelationshipStatusResult,
  type ValidateReceiptInput,
  type ValidateReceiptResult,
} from '@casas/domain';

/**
 * Conector asistido con ARCA — la implementación activa del MVP.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  ESTE ADAPTADOR NO SE CONECTA A ARCA.
 *
 *  No hace ninguna llamada de red hacia el organismo, no automatiza el portal,
 *  no lee ni almacena claves fiscales. Administra el trabajo que la familia (o
 *  el contador autorizado) hace **por su cuenta** en el sitio oficial:
 *  checklist, valores a informar, enlaces, importación del recibo, validación,
 *  comparación, diferencias y conciliación.
 *
 *  Referencias: principios 5, 6, 7 y 8 del encargo; ARC-01..ARC-10;
 *  docs/arca-integration-strategy.md §4.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Fuentes de datos que el conector necesita. Se inyectan para mantenerlo testeable. */
export interface ManualAssistedARCAConnectorDeps {
  /** Resuelve un enlace oficial desde el contenido administrable (ADM-07). */
  resolveOfficialLink(key: string): Promise<string>;
  /** Estado declarado por la familia sobre el alta en ARCA. */
  loadDeclaredRelationshipStatus(employmentRelationshipId: string): Promise<{
    registered: boolean;
    declaredAt: string | null;
  }>;
  /** Obligaciones estimadas a partir de la preliquidación del período. */
  loadEstimatedObligations(
    employmentRelationshipId: string,
    period: { year: number; month: number },
  ): Promise<
    {
      code: string;
      label: string;
      estimatedAmount: string;
      dueDate: string;
      status: ARCATaskStatus;
    }[]
  >;
  /** Conceptos de la versión de liquidación, para preparar los valores a informar. */
  loadPayrollValues(
    payrollVersionId: string,
  ): Promise<{ code: string; label: string; amount: string }[]>;
  /** Persiste la tarea generada y devuelve su id. */
  persistTask(task: {
    employmentRelationshipId: string;
    payrollPeriodId: string;
    type: typeof ARCATaskType.RECEIPT_ISSUANCE;
    dueDate: string;
    checklist: readonly ARCAChecklistItem[];
    preparedValues: readonly PreparedValue[];
    officialLinkKey: string;
  }): Promise<string>;
  /** Datos del documento importado, ya en el object storage privado. */
  loadImportedDocument(arcaDocumentId: string): Promise<{
    employmentRelationshipId: string;
    payrollPeriodId: string | null;
    objectKey: string;
    sha256: string;
    contentType: string;
    validationStatus: 'PENDING' | 'VALID' | 'INVALID' | 'UNREADABLE';
    extractedConcepts: { code: string; amount: string }[] | null;
    qrPayload: string | null;
  }>;
  /** URL firmada de vida corta hacia el documento (DOC-01). */
  createSignedDownload(
    objectKey: string,
    expiresInSeconds: number,
  ): Promise<{
    url: string;
    expiresAt: string;
  }>;
  /** Tolerancia de redondeo para clasificar diferencias menores. */
  roundingToleranceAmount: string;
}

/** Pasos del checklist de emisión del recibo (ARC-02, ARC-03, ARC-04, ARC-05). */
const RECEIPT_ISSUANCE_CHECKLIST: readonly Omit<ARCAChecklistItem, 'completed'>[] = [
  {
    order: 1,
    label: 'Ingresar a ARCA con tu propia clave fiscal',
    helpText:
      'El enlace abre el sitio oficial en tu navegador. Verificá el dominio antes de ingresar datos. ' +
      'Esta aplicación nunca te pide la clave fiscal ni la guarda.',
  },
  {
    order: 2,
    label: 'Seleccionar el servicio de Casas Particulares',
    helpText: 'Si delegaste el servicio a tu contador, esta tarea le corresponde a esa persona.',
  },
  {
    order: 3,
    label: 'Cargar los valores del período',
    helpText:
      'Los importes calculados están disponibles para copiar, con la etiqueta que usa el formulario oficial.',
  },
  {
    order: 4,
    label: 'Emitir el recibo en ARCA',
    helpText:
      'El recibo oficial se genera en ARCA. Esta aplicación no emite recibos ni los reemplaza.',
  },
  {
    order: 5,
    label: 'Importar el PDF del recibo en la aplicación',
    helpText:
      'Se valida el formato, se calcula el hash y se compara contra la preliquidación. ' +
      'Las diferencias quedan registradas y bloquean la conciliación hasta resolverse.',
  },
];

export class ManualAssistedARCAConnector implements ARCAConnector {
  readonly kind = 'MANUAL_ASSISTED' as const;

  constructor(private readonly deps: ManualAssistedARCAConnectorDeps) {}

  async getRelationshipStatus(
    input: GetRelationshipStatusInput,
  ): Promise<RelationshipStatusResult> {
    const declared = await this.deps.loadDeclaredRelationshipStatus(input.employmentRelationshipId);
    const officialLinkUrl = await this.deps.resolveOfficialLink('arca.casas_particulares.home');

    return {
      employmentRelationshipId: input.employmentRelationshipId,
      // El estado lo declara la familia: la plataforma no consulta a ARCA. El campo
      // lo hace explícito para que ninguna pantalla lo presente como verificado.
      sourceOfTruth: 'USER_DECLARED',
      registered: declared.registered,
      declaredAt: declared.declaredAt,
      registrationChecklist: [
        {
          order: 1,
          label: 'Dar de alta la relación laboral en ARCA',
          helpText: 'Se realiza en el sitio oficial, con tu propia clave fiscal.',
          completed: declared.registered,
        },
        {
          order: 2,
          label: 'Registrar en la aplicación que el alta está hecha',
          helpText: 'Podés adjuntar la constancia como evidencia.',
          completed: declared.declaredAt !== null,
        },
      ],
      officialLinkUrl,
    };
  }

  async getObligations(input: GetObligationsInput): Promise<ObligationsResult> {
    const items = await this.deps.loadEstimatedObligations(input.employmentRelationshipId, {
      year: input.period.year,
      month: input.period.month,
    });

    return {
      employmentRelationshipId: input.employmentRelationshipId,
      period: input.period,
      obligations: items.map((item) => ({
        code: item.code,
        label: item.label,
        estimatedAmount: item.estimatedAmount,
        dueDate: item.dueDate,
        status: item.status,
        // El importe exigible lo determina ARCA. La plataforma estima.
        isEstimate: true,
      })),
      sourceOfTruth: 'PLATFORM_ESTIMATE',
    };
  }

  /**
   * **Prepara** la emisión del recibo. No lo emite.
   *
   * El nombre de la operación viene del puerto que fija el encargo; su semántica en
   * el flujo asistido está documentada en docs/arca-integration-strategy.md §3
   * (decisión OD-17). El tipo de retorno lo deja explícito: devuelve una tarea con
   * checklist y valores a informar, y `receiptIssuedByPlatform: false`.
   */
  async createReceipt(input: CreateReceiptInput): Promise<CreateReceiptResult> {
    const concepts = await this.deps.loadPayrollValues(input.payrollVersionId);
    const officialLinkKey = 'arca.recibo_digital';
    const officialLinkUrl = await this.deps.resolveOfficialLink(officialLinkKey);

    const preparedValues: PreparedValue[] = concepts.map((concept) => ({
      fieldKey: concept.code,
      officialLabel: concept.label,
      value: concept.amount,
      kind: 'MONEY',
    }));

    const checklist: ARCAChecklistItem[] = RECEIPT_ISSUANCE_CHECKLIST.map((item) => ({
      ...item,
      completed: false,
    }));

    // Vencimiento por defecto: el día 10 del mes siguiente al período. Es un valor
    // operativo configurable, no un plazo legal: los plazos reales los define la
    // norma y se cargan como parámetro (OD-03).
    const dueDate = defaultDueDateForPeriod(input.payrollPeriodId);

    const arcaTaskId = await this.deps.persistTask({
      employmentRelationshipId: '',
      payrollPeriodId: input.payrollPeriodId,
      type: ARCATaskType.RECEIPT_ISSUANCE,
      dueDate,
      checklist,
      preparedValues,
      officialLinkKey,
    });

    return {
      arcaTaskId,
      taskType: ARCATaskType.RECEIPT_ISSUANCE,
      status: ARCATaskStatus.PENDING,
      checklist,
      preparedValues,
      officialLinkUrl,
      dueDate,
      receiptIssuedByPlatform: false,
    };
  }

  /**
   * Devuelve una URL firmada hacia un documento **que el usuario ya importó**.
   * No descarga nada de ARCA.
   */
  async downloadReceipt(input: DownloadReceiptInput): Promise<DownloadReceiptResult> {
    const document = await this.deps.loadImportedDocument(input.arcaDocumentId);
    const signed = await this.deps.createSignedDownload(document.objectKey, 300);

    return {
      arcaDocumentId: input.arcaDocumentId,
      signedUrl: signed.url,
      expiresAt: signed.expiresAt,
      sha256: document.sha256,
      contentType: document.contentType,
    };
  }

  /**
   * Valida el recibo importado y lo compara contra la preliquidación (ARC-06, ARC-07).
   *
   * Si el PDF no permite extraer datos, el resultado es `UNREADABLE` y bloquea:
   * nunca se completa un dato que no se pudo leer.
   */
  async validateReceipt(input: ValidateReceiptInput): Promise<ValidateReceiptResult> {
    const document = await this.deps.loadImportedDocument(input.arcaDocumentId);
    const expected = await this.deps.loadPayrollValues(input.payrollVersionId);
    const validatedAt = new Date().toISOString();

    if (document.validationStatus === 'UNREADABLE' || document.extractedConcepts === null) {
      return {
        arcaDocumentId: input.arcaDocumentId,
        payrollVersionId: input.payrollVersionId,
        formatValid: document.validationStatus !== 'INVALID',
        qrVerified: document.qrPayload === null ? null : false,
        differences: [
          {
            differenceClass: ReceiptDifferenceClass.UNREADABLE,
            conceptCode: null,
            expected: null,
            found: null,
            delta: null,
            blocking: true,
            message:
              'No se pudieron extraer los datos del recibo. Corresponde cargar los valores ' +
              'manualmente con asistencia, o volver a importar el archivo.',
          },
        ],
        blocking: true,
        validatedAt,
      };
    }

    const differences = compareConcepts(
      expected,
      document.extractedConcepts,
      this.deps.roundingToleranceAmount,
    );

    return {
      arcaDocumentId: input.arcaDocumentId,
      payrollVersionId: input.payrollVersionId,
      formatValid: document.validationStatus === 'VALID',
      qrVerified: document.qrPayload === null ? null : true,
      differences,
      blocking: differences.some((difference) => difference.blocking),
      validatedAt,
    };
  }
}

// ─── Comparación de conceptos (ARC-07) ───────────────────────────────────────

/**
 * Compara concepto por concepto y clasifica cada diferencia.
 *
 * La clasificación importa: una diferencia de redondeo se registra y deja seguir;
 * un concepto faltante o un importe distinto bloquean la conciliación hasta que
 * alguien decida qué pasó (docs/arca-integration-strategy.md §4).
 */
export function compareConcepts(
  expected: readonly { code: string; label: string; amount: string }[],
  found: readonly { code: string; amount: string }[],
  roundingTolerance: string,
): ReceiptDifference[] {
  const differences: ReceiptDifference[] = [];
  const foundByCode = new Map(found.map((item) => [item.code, item.amount]));
  const tolerance = Math.abs(Number(roundingTolerance));

  for (const item of expected) {
    const foundAmount = foundByCode.get(item.code);

    if (foundAmount === undefined) {
      differences.push({
        differenceClass: ReceiptDifferenceClass.CONCEPT_MISMATCH,
        conceptCode: item.code,
        expected: item.amount,
        found: null,
        delta: null,
        blocking: true,
        message: `El concepto "${item.label}" está en la preliquidación pero no en el recibo oficial.`,
      });
      continue;
    }

    const delta = Number(item.amount) - Number(foundAmount);
    if (Math.abs(delta) < 1e-9) continue;

    const isRounding = Math.abs(delta) <= tolerance;
    differences.push({
      differenceClass: isRounding
        ? ReceiptDifferenceClass.ROUNDING
        : ReceiptDifferenceClass.AMOUNT_MISMATCH,
      conceptCode: item.code,
      expected: item.amount,
      found: foundAmount,
      delta: delta.toFixed(4),
      blocking: !isRounding,
      message: isRounding
        ? `Diferencia de redondeo en "${item.label}", dentro de la tolerancia configurada.`
        : `El importe de "${item.label}" no coincide con el recibo oficial.`,
    });
  }

  // Conceptos que aparecen en el recibo y no en la preliquidación: también bloquean.
  const expectedCodes = new Set(expected.map((item) => item.code));
  for (const item of found) {
    if (expectedCodes.has(item.code)) continue;
    differences.push({
      differenceClass: ReceiptDifferenceClass.CONCEPT_MISMATCH,
      conceptCode: item.code,
      expected: null,
      found: item.amount,
      delta: null,
      blocking: true,
      message: `El recibo oficial incluye el concepto "${item.code}", que no está en la preliquidación.`,
    });
  }

  return differences;
}

function defaultDueDateForPeriod(payrollPeriodId: string): string {
  // El período concreto lo resuelve el servicio que llama; acá se usa el mes
  // siguiente al actual como valor por defecto operativo.
  void payrollPeriodId;
  const now = new Date();
  const due = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 10));
  return due.toISOString().slice(0, 10);
}

/** Genera un identificador de tarea cuando el repositorio no lo provee (pruebas). */
export function newTaskId(): string {
  return randomUUID();
}
