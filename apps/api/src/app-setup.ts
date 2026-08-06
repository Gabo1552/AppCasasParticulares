import { randomUUID } from 'node:crypto';
import { CORRELATION_HEADER, runWithContext } from '@casas/observability';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from './config/app-config';
import { DomainExceptionFilter } from './common/http/domain-exception.filter';

/** Límite de cuerpo por request. Se afina por endpoint cuando haga falta. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * Middleware y controles de seguridad de la API.
 *
 * Vive acá y no dentro de `bootstrap()` para que las pruebas de integración
 * levanten **exactamente la misma** aplicación que producción. Una prueba que
 * arma su propio Nest sin CSRF, sin filtro de excepciones y sin prefijo global
 * verifica una aplicación que no existe.
 */
export function configureApp(app: INestApplication, config: AppConfig): void {
  app.use(cookieParser());
  app.useGlobalFilters(new DomainExceptionFilter());

  // Headers de seguridad. CSP restrictiva: la API sirve JSON, no HTML.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      referrerPolicy: { policy: 'no-referrer' },
      hsts:
        config.NODE_ENV === 'production' ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );

  // CORS con lista blanca explícita. Nunca "*" (docs/security-model.md §5).
  app.enableCors({
    origin: config.CORS_ALLOWED_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Idempotency-Key',
      'x-csrf-token',
      CORRELATION_HEADER,
    ],
    maxAge: 600,
  });

  // Correlación: un id por request, propagado a logs, trazas y auditoría.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const incoming = req.header(CORRELATION_HEADER);
    const correlationId = incoming !== undefined && incoming.length > 0 ? incoming : randomUUID();
    res.setHeader(CORRELATION_HEADER, correlationId);
    runWithContext({ correlationId, route: req.path }, () => {
      next();
    });
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const contentLength = Number(req.header('content-length') ?? '0');
    if (contentLength > MAX_BODY_BYTES) {
      res.status(413).json({ code: 'PAYLOAD_TOO_LARGE', message: 'El cuerpo excede el máximo.' });
      return;
    }
    next();
  });

  app.setGlobalPrefix('api/v1', { exclude: ['health', 'ready'] });
}
