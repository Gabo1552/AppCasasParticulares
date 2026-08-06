import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Errores de aplicación con código estable.
 *
 * El cliente reacciona al `code`, no al texto: el mensaje es para la persona y
 * puede cambiar sin romper nada. Los mensajes están en español porque los ve un
 * usuario final.
 */
export class AppError extends HttpException {
  constructor(
    readonly code: string,
    message: string,
    status: HttpStatus,
    readonly details?: Record<string, unknown>,
  ) {
    super({ code, message, ...(details === undefined ? {} : { details }) }, status);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('NOT_FOUND', message, HttpStatus.NOT_FOUND, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('FORBIDDEN', message, HttpStatus.FORBIDDEN, details);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, HttpStatus.CONFLICT, details);
  }
}

export class UnprocessableError extends AppError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, HttpStatus.UNPROCESSABLE_ENTITY, details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('TOO_MANY_REQUESTS', message, HttpStatus.TOO_MANY_REQUESTS, details);
  }
}

/**
 * Falta el perfil que la operación requiere.
 *
 * Se distingue de un 403 común porque la web lo usa para mandar a la persona a
 * completar el onboarding en lugar de mostrar "no tenés permiso".
 */
export class ProfileRequiredError extends AppError {
  constructor(profile: 'EMPLOYER' | 'WORKER') {
    super(
      'PROFILE_REQUIRED',
      profile === 'EMPLOYER'
        ? 'Necesitás completar tu perfil de familia empleadora.'
        : 'Necesitás completar tu perfil de trabajadora.',
      HttpStatus.FORBIDDEN,
      { profile },
    );
  }
}
