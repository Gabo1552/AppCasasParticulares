import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { PlatformRole } from '@casas/database';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';

/** Contenido del access token. Sin datos personales: sólo identificadores. */
export interface AccessTokenPayload {
  readonly sub: string;
  readonly sid: string;
  readonly roles: PlatformRole[];
  readonly emp: string | null;
  readonly wrk: string | null;
}

/** Vida del access token. Corto a propósito: el refresh lo renueva. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
/** Vida de la sesión completa. */
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

@Injectable()
export class AccessTokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  sign(payload: AccessTokenPayload): string {
    return this.jwt.sign(payload, {
      secret: this.config.JWT_ACCESS_SECRET,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  }

  /** Devuelve el payload, o `null` si el token es inválido o venció. */
  verify(token: string): AccessTokenPayload | null {
    try {
      return this.jwt.verify<AccessTokenPayload>(token, {
        secret: this.config.JWT_ACCESS_SECRET,
      });
    } catch {
      return null;
    }
  }
}
