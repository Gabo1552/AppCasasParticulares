import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Cifrado de campos con rotación real de claves (docs/adr/0003-otp-outbox-security.md).
 *
 * El payload lleva el `keyId` con el que fue cifrado y el descifrado resuelve la
 * clave por ese identificador. Sin eso, "rotar" es escribir un número distinto en
 * el payload y seguir usando la misma clave: los mensajes cifrados con la clave
 * anterior dejarían de leerse en cuanto la clave cambiara de verdad.
 *
 * AES-256-GCM con IV aleatorio de 12 bytes. El tag de autenticación que GCM
 * produce es lo que garantiza integridad: no se agrega ninguna comprobación
 * propia encima.
 */

/** AES-256 exige exactamente 32 bytes. Ni menos, ni rellenados. */
const KEY_BYTES = 32;
/** Tamaño recomendado para GCM: 96 bits. */
const IV_BYTES = 12;

export class FieldEncryptionConfigError extends Error {}
export class FieldEncryptionUnknownKeyError extends Error {
  constructor(readonly keyId: string) {
    super(
      `El payload fue cifrado con la clave "${keyId}", que no está en el keyring. ` +
        'Una clave retirada antes de tiempo vuelve ilegible todo lo que cifró: ' +
        'conservala en FIELD_ENCRYPTION_KEYS hasta que no queden payloads suyos.',
    );
  }
}

export interface FieldEncryptionKeyring {
  readonly activeKeyId: string;
  readonly keys: ReadonlyMap<string, Buffer>;
}

/**
 * Construye el keyring desde la configuración.
 *
 * Formato de `rawKeys`: `v1:<base64>,v2:<base64>`. Cada clave debe decodificar a
 * exactamente 32 bytes. Una clave corta **no se rellena**: se rechaza. Rellenar
 * convierte una clave mal configurada en una que parece válida, que es
 * exactamente el error que se quiere hacer imposible.
 */
export function buildKeyring(rawKeys: string, activeKeyId: string): FieldEncryptionKeyring {
  const keys = new Map<string, Buffer>();

  const entries = rawKeys
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (entries.length === 0) {
    throw new FieldEncryptionConfigError(
      'FIELD_ENCRYPTION_KEYS está vacío. Formato esperado: "v1:<base64>,v2:<base64>".',
    );
  }

  for (const entry of entries) {
    const separator = entry.indexOf(':');
    if (separator <= 0 || separator === entry.length - 1) {
      throw new FieldEncryptionConfigError(
        `La entrada "${redactEntry(entry)}" de FIELD_ENCRYPTION_KEYS no tiene el formato "<keyId>:<base64>".`,
      );
    }

    const keyId = entry.slice(0, separator).trim();
    const encoded = entry.slice(separator + 1).trim();

    if (keyId.includes(':')) {
      throw new FieldEncryptionConfigError(
        `El identificador de clave "${keyId}" no puede contener ":": es el separador del payload.`,
      );
    }
    if (keys.has(keyId)) {
      throw new FieldEncryptionConfigError(
        `El identificador de clave "${keyId}" aparece más de una vez en FIELD_ENCRYPTION_KEYS.`,
      );
    }

    const material = Buffer.from(encoded, 'base64');
    // Buffer.from ignora en silencio lo que no es base64 válido, así que la única
    // comprobación que sirve es el largo del resultado.
    if (material.length !== KEY_BYTES) {
      throw new FieldEncryptionConfigError(
        `La clave "${keyId}" decodifica a ${material.length} bytes y AES-256 exige ${KEY_BYTES}. ` +
          'Generá una con: openssl rand -base64 32',
      );
    }

    keys.set(keyId, material);
  }

  if (!keys.has(activeKeyId)) {
    throw new FieldEncryptionConfigError(
      `FIELD_ENCRYPTION_ACTIVE_KEY_ID="${activeKeyId}" no está entre las claves definidas ` +
        `(${[...keys.keys()].join(', ')}).`,
    );
  }

  return { activeKeyId, keys };
}

/** Cifra con la clave activa y deja el `keyId` en el payload. */
export function encryptField(keyring: FieldEncryptionKeyring, plaintext: string): string {
  const key = keyring.keys.get(keyring.activeKeyId);
  if (key === undefined) throw new FieldEncryptionUnknownKeyError(keyring.activeKeyId);

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    keyring.activeKeyId,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/**
 * Descifra resolviendo la clave por el `keyId` del propio payload.
 *
 * Un payload cifrado con una clave anterior sigue siendo legible mientras esa
 * clave esté en el keyring: eso es lo que hace que la rotación sea rotación.
 */
export function decryptField(keyring: FieldEncryptionKeyring, payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 4) {
    throw new FieldEncryptionConfigError(
      'El payload cifrado no tiene el formato "<keyId>:<iv>:<tag>:<ciphertext>".',
    );
  }

  const [keyId, ivPart, tagPart, contentPart] = parts as [string, string, string, string];

  const key = keyring.keys.get(keyId);
  if (key === undefined) throw new FieldEncryptionUnknownKeyError(keyId);

  const iv = Buffer.from(ivPart, 'base64');
  const tag = Buffer.from(tagPart, 'base64');
  const content = Buffer.from(contentPart, 'base64');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  // Si el ciphertext o el tag fueron alterados, `final()` lanza. Es la garantía
  // de integridad de GCM y no hay que agregarle nada.
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(content), decipher.final()]).toString('utf8');
}

/** Evita que un error de configuración escriba material de clave en un log. */
function redactEntry(entry: string): string {
  const separator = entry.indexOf(':');
  return separator > 0 ? `${entry.slice(0, separator)}:******` : '******';
}
