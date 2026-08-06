import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Valida el cuerpo con un esquema Zod y devuelve el valor tipado.
 *
 * Los esquemas son `.strict()`, así que un campo desconocido en el body se
 * rechaza en lugar de ignorarse: si alguien intenta colar `employerId` o `role`,
 * la petición falla en vez de pasar el valor a un servicio que quizá lo use.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Revisá los datos ingresados.',
        details: {
          issues: result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
    }

    return result.data;
  }
}
