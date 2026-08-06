import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import { AppModule } from '../../app.module';
import { configureApp } from '../../app-setup';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';

/**
 * Cliente de las pruebas de integración.
 *
 * Levanta la aplicación real —mismos guards, mismo filtro de excepciones, mismo
 * prefijo— contra PostgreSQL real. Nada está simulado salvo el envío de correo,
 * que en este entorno apunta a Mailpit y falla en silencio si no está corriendo.
 */
export async function bootTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app, app.get<AppConfig>(APP_CONFIG));
  await app.init();
  return app;
}

export interface Session {
  readonly email: string;
  readonly userId: string;
  readonly accessToken: string;
}

/**
 * Sesión autenticada sobre la API real.
 *
 * Se autentica con Bearer en lugar de cookies: el guard de CSRF no aplica a los
 * requests con `Authorization`, que es exactamente el caso de la app móvil y de
 * estas pruebas. El recorrido con cookies y CSRF lo cubre el E2E en el navegador.
 */
export class ApiClient {
  private accessToken: string | null = null;

  constructor(private readonly app: INestApplication) {}

  private get server(): App {
    return this.app.getHttpServer() as App;
  }

  get token(): string | null {
    return this.accessToken;
  }

  useToken(token: string | null): void {
    this.accessToken = token;
  }

  private auth(req: request.Test): request.Test {
    return this.accessToken === null ? req : req.set('Authorization', `Bearer ${this.accessToken}`);
  }

  get(path: string): request.Test {
    return this.auth(request(this.server).get(`/api/v1${path}`));
  }

  post(path: string, body: unknown = {}): request.Test {
    return this.auth(
      request(this.server)
        .post(`/api/v1${path}`)
        .send(body as object),
    );
  }

  patch(path: string, body: unknown = {}): request.Test {
    return this.auth(
      request(this.server)
        .patch(`/api/v1${path}`)
        .send(body as object),
    );
  }

  put(path: string, body: unknown = {}): request.Test {
    return this.auth(
      request(this.server)
        .put(`/api/v1${path}`)
        .send(body as object),
    );
  }

  delete(path: string): request.Test {
    return this.auth(request(this.server).delete(`/api/v1${path}`));
  }

  /**
   * Ingresa con un correo nuevo.
   *
   * El código se obtiene del endpoint de apoyo de pruebas, que lo recupera
   * probando el espacio de seis dígitos contra el HMAC almacenado. Es lento a
   * propósito y sólo existe con el flag encendido: la prueba no puede leer el
   * código de la base porque la base no lo tiene.
   */
  async login(email: string): Promise<Session> {
    await this.post('/auth/request-code', { email }).expect(201);

    const codeResponse = await request(this.server)
      .get('/api/v1/test-support/last-access-code')
      .query({ email })
      .expect(200);

    const code = (codeResponse.body as { code: string }).code;
    const verified = await this.post('/auth/verify-code', { email, code }).expect(201);
    const body = verified.body as { userId: string; accessToken: string };

    this.accessToken = body.accessToken;
    return { email, userId: body.userId, accessToken: body.accessToken };
  }

  /**
   * Crea el perfil y adopta el access token nuevo.
   *
   * Crear el perfil otorga el rol, y el token con el que se hizo el request no
   * lo declara: la API devuelve uno actualizado y el cliente lo adopta, igual
   * que hace la web.
   */
  async createProfile(kind: 'employer' | 'worker', body: object): Promise<void> {
    const response = await this.post(`/${kind}-profile`, body).expect(201);
    this.accessToken = (response.body as { accessToken: string }).accessToken;
  }

  /** Token en claro de la última invitación enviada a ese correo. */
  async invitationToken(email: string): Promise<string> {
    const response = await request(this.server)
      .get('/api/v1/test-support/invitation-token')
      .query({ email })
      .expect(200);
    return (response.body as { token: string }).token;
  }
}

/** Correo único por prueba: evita chocar con corridas anteriores en la misma base. */
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@example.test`;
}

export const VALID_PROFILE = {
  firstName: 'Ana',
  lastName: 'Gómez',
  phone: '+54 11 5555-1234',
  consents: { acceptedTerms: true, acceptedPrivacyPolicy: true },
};

export const VALID_HOUSEHOLD = {
  label: 'Casa de Palermo',
  street: 'Av. Santa Fe',
  streetNumber: '3200',
  floor: '4',
  apartment: 'B',
  city: 'CABA',
  province: 'Ciudad Autónoma de Buenos Aires',
  postalCode: 'C1425',
};

export const VALID_CONDITIONS = {
  plannedStartDate: '2026-09-01',
  categoryCode: 'TAREAS_GENERALES',
  liveInMode: 'WITH_WITHDRAWAL' as const,
  remunerationScheme: 'MONTHLY' as const,
  agreedRemuneration: '350000.00',
  weeklyHours: 24,
  paymentDayOfMonth: 5,
};

export const VALID_SCHEDULE = {
  effectiveFrom: '2026-09-01',
  days: [
    { dayOfWeek: 1, startTime: '09:00', endTime: '15:00', breakMinutes: 30 },
    { dayOfWeek: 3, startTime: '09:00', endTime: '15:00', breakMinutes: 30 },
    { dayOfWeek: 5, startTime: '09:00', endTime: '15:00', breakMinutes: 30 },
  ],
};
