/**
 * Redacción de datos sensibles.
 *
 * Se aplica antes de serializar cualquier cosa: logs, eventos de auditoría,
 * métricas y trazas. La sección 13.1 del documento y el principio 14 del encargo
 * exigen que no salgan secretos ni datos personales innecesarios; INV-AUD-02 lo
 * exige también para la auditoría.
 *
 * El enfoque es de lista negra por nombre de campo **más** detección por patrón,
 * porque un campo puede llamarse cualquier cosa y contener un CBU igual.
 */

export const REDACTED = '[REDACTADO]';

/**
 * Campos que nunca se serializan.
 *
 * `claveFiscal` y sus variantes están en la lista aunque el sistema no tenga ese
 * campo (SEG-06): si alguna vez aparece por error, el logger no lo va a imprimir.
 */
export const SENSITIVE_FIELD_NAMES: readonly string[] = [
  // Credenciales
  'password',
  'passwordhash',
  'contrasena',
  'contraseña',
  'clave',
  'clavefiscal',
  'claveFiscal',
  'secret',
  'secreto',
  'token',
  'accesstoken',
  'refreshtoken',
  'refreshtokenhash',
  'authorization',
  'cookie',
  'apikey',
  'privatekey',
  'mfasecret',
  'mfasecretcipher',
  'otp',
  'codehash',
  'pin',
  'pinhash',

  // Datos bancarios y de identidad
  'cbu',
  'cvu',
  'numbercipher',
  'accountnumber',
  'cuil',
  'cuit',
  'cuilcipher',
  'dni',
  'documentnumber',

  // Contenido de archivos
  'filecontent',
  'body64',
  'base64',
];

/** Patrones que se redactan aunque el campo tenga un nombre inocente. */
const VALUE_PATTERNS: readonly RegExp[] = [
  // 22 dígitos consecutivos: CBU o CVU.
  /\b\d{22}\b/g,
  // Bearer <token>
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  // JWT
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g,
];

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[_\-\s]/g, '');
  return SENSITIVE_FIELD_NAMES.some((sensitive) => {
    const normalizedSensitive = sensitive.toLowerCase().replace(/[_\-\s]/g, '');
    return normalized === normalizedSensitive || normalized.includes(normalizedSensitive);
  });
}

function redactString(value: string): string {
  let result = value;
  for (const pattern of VALUE_PATTERNS) {
    result = result.replace(pattern, REDACTED);
  }
  return result;
}

/**
 * Devuelve una copia con los valores sensibles reemplazados.
 *
 * No muta la entrada. Maneja ciclos: un objeto que se referencia a sí mismo no
 * cuelga el logger.
 */
export function redact<T>(value: T, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') return redactString(value);
  if (typeof value !== 'object') return value;

  if (seen.has(value as object)) return '[CICLO]';
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen));
  }

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) };
  }

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = isSensitiveKey(key) ? REDACTED : redact(item, seen);
  }
  return output;
}

/**
 * Enmascara un CBU/CVU dejando sólo los últimos 4 dígitos.
 *
 * La representación canónica en toda la aplicación es `MaskedAccount` de
 * @casas/domain; esta función existe para el caso en que un número completo
 * llegue por un camino inesperado y haya que registrarlo de todos modos.
 */
export function maskAccountNumber(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return REDACTED;
  return `${'•'.repeat(Math.max(digits.length - 4, 0))}${digits.slice(-4)}`;
}
