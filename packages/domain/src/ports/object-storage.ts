/**
 * Puerto de almacenamiento de documentos.
 *
 * Los archivos viven fuera de la base de datos, en object storage privado; los
 * metadatos y permisos viven en la base (sección 14.1). MinIO en desarrollo, un
 * proveedor compatible con S3 en producción — la misma interfaz para ambos.
 *
 * El acceso es siempre por URL firmada de vida corta. **El bucket nunca es público**
 * (DOC-01, docs/security-model.md §8).
 */

export const DocumentScanStatus = {
  PENDING: 'PENDING',
  CLEAN: 'CLEAN',
  INFECTED: 'INFECTED',
  FAILED: 'FAILED',
} as const;
export type DocumentScanStatus = (typeof DocumentScanStatus)[keyof typeof DocumentScanStatus];

export interface SignedUploadInput {
  readonly objectKey: string;
  readonly contentType: string;
  readonly maxSizeBytes: number;
  readonly expiresInSeconds: number;
}

export interface SignedUploadResult {
  readonly objectKey: string;
  readonly signedUrl: string;
  readonly expiresAt: string;
  /** Cabeceras que el cliente debe enviar para que la firma sea válida. */
  readonly requiredHeaders: Readonly<Record<string, string>>;
}

export interface SignedDownloadInput {
  readonly objectKey: string;
  readonly expiresInSeconds: number;
  /** Nombre sugerido para la descarga. */
  readonly downloadFilename?: string;
}

export interface SignedDownloadResult {
  readonly objectKey: string;
  readonly signedUrl: string;
  readonly expiresAt: string;
}

export interface ObjectMetadata {
  readonly objectKey: string;
  readonly sizeBytes: number;
  /** Tipo detectado por contenido, no por extensión (docs/security-model.md §8). */
  readonly detectedContentType: string;
  readonly sha256: string;
  readonly uploadedAt: string;
}

export interface ObjectStorage {
  createSignedUpload(input: SignedUploadInput): Promise<SignedUploadResult>;
  createSignedDownload(input: SignedDownloadInput): Promise<SignedDownloadResult>;
  /** Lee metadatos y calcula el hash tras la subida, para verificar integridad (DOC-03). */
  headObject(objectKey: string): Promise<ObjectMetadata>;
  exists(objectKey: string): Promise<boolean>;
  /**
   * Sólo para objetos huérfanos (subidas abandonadas). Los documentos vinculados a
   * una relación laboral, liquidación, recibo o pago no se borran (decisión D10).
   */
  deleteOrphanObject(objectKey: string): Promise<void>;
}

export const OBJECT_STORAGE = Symbol.for('casas.ports.ObjectStorage');

export interface AntivirusScanner {
  scan(objectKey: string): Promise<{ status: DocumentScanStatus; details: string | null }>;
}

export const ANTIVIRUS_SCANNER = Symbol.for('casas.ports.AntivirusScanner');
