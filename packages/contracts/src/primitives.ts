import { z } from 'zod';

/**
 * Primitivos compartidos por todos los contratos.
 *
 * Viven en su propio módulo y no en `index.ts` para romper el ciclo: `index.ts`
 * re-exporta los contratos por dominio, y esos módulos necesitan los primitivos.
 * Si los tomaran de `index.ts`, al evaluarse quedarían `undefined`.
 */

/**
 * Importe monetario: **string decimal**, nunca `number`.
 *
 * JSON no tiene decimal exacto. Aceptar un `number` acá reintroduciría el error
 * binario que se evita en todo el resto de la cadena (RN-13, principio 11).
 */
export const moneySchema = z
  .string()
  .regex(/^-?\d{1,15}(\.\d{1,4})?$/, 'El importe debe ser un decimal con hasta 4 decimales.');

export const currencySchema = z.literal('ARS');

export const moneyValueSchema = z.object({
  amount: moneySchema,
  currency: currencySchema,
});

export const uuidSchema = z.string().uuid();

export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD.');

export const isoDateTimeSchema = z.string().datetime({ offset: true });

/** Minutos enteros no negativos. El tiempo no se mide en horas fraccionarias. */
export const minutesSchema = z.number().int().min(0);
