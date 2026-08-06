import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  ARCAIntegrationNotEnabledError,
  DomainError,
  IllegalStateTransitionError,
  InvalidValueError,
  ObjectPermissionDeniedError,
  TransitionGuardError,
} from '@casas/domain';
import { OptimisticLockError } from '@casas/database';
import { getCorrelationId } from '@casas/observability';
import type { Response } from 'express';

/**
 * Traduce errores del dominio a respuestas HTTP.
 *
 * Sin esto, una invariante violada llegaría al cliente como un 500 genérico y la
 * persona no sabría qué corregir. Cada error del dominio ya trae un mensaje en
 * español pensado para leerse.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const correlationId = getCorrelationId();

    const { status, body } = this.translate(exception);

    response.status(status).json({
      ...body,
      ...(correlationId === undefined ? {} : { correlationId }),
    });
  }

  private translate(exception: unknown): {
    status: number;
    body: { code: string; message: string; details?: unknown };
  } {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      if (typeof payload === 'object' && payload !== null && 'code' in payload) {
        return {
          status: exception.getStatus(),
          body: payload as { code: string; message: string },
        };
      }
      return {
        status: exception.getStatus(),
        body: { code: 'HTTP_ERROR', message: exception.message },
      };
    }

    if (exception instanceof OptimisticLockError) {
      // 409: otro actor modificó el recurso mientras tanto (decisión D11).
      return {
        status: HttpStatus.CONFLICT,
        body: { code: exception.code, message: exception.message },
      };
    }

    if (exception instanceof ARCAIntegrationNotEnabledError) {
      return {
        status: HttpStatus.NOT_IMPLEMENTED,
        body: { code: exception.code, message: exception.message },
      };
    }

    if (exception instanceof ObjectPermissionDeniedError) {
      return {
        status: HttpStatus.FORBIDDEN,
        body: { code: exception.code, message: exception.message },
      };
    }

    if (
      exception instanceof IllegalStateTransitionError ||
      exception instanceof TransitionGuardError
    ) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        body: { code: exception.code, message: exception.message, details: exception.context },
      };
    }

    if (exception instanceof InvalidValueError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: { code: exception.code, message: exception.message, details: exception.context },
      };
    }

    if (exception instanceof DomainError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: { code: exception.code, message: exception.message },
      };
    }

    // Cualquier otra cosa es un fallo nuestro: no se filtra el detalle al cliente.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado.' },
    };
  }
}
