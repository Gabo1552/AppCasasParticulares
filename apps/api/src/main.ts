import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CORRELATION_HEADER, createLogger, runWithContext } from '@casas/observability';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { APP_CONFIG, type AppConfig } from './config/app-config';
import { DomainExceptionFilter } from './common/http/domain-exception.filter';

/**
 * Arranque de la API.
 *
 * Los controles de seguridad se aplican acá, de manera global, y no controlador por
 * controlador: es la diferencia entre una garantía y una convención
 * (docs/security-model.md §5).
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get<AppConfig>(APP_CONFIG);
  const logger = createLogger({
    level: config.LOG_LEVEL,
    pretty: config.NODE_ENV === 'development',
  });

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

  // Límite de tamaño del body, por endpoint se afina en la Etapa 3.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const contentLength = Number(req.header('content-length') ?? '0');
    if (contentLength > 2 * 1024 * 1024) {
      res.status(413).json({ code: 'PAYLOAD_TOO_LARGE', message: 'El cuerpo excede el máximo.' });
      return;
    }
    next();
  });

  app.setGlobalPrefix('api/v1', { exclude: ['health', 'ready'] });

  // OpenAPI (NFR-10). En producción no se expone la UI.
  if (config.NODE_ENV !== 'production') {
    const openapi = new DocumentBuilder()
      .setTitle('Plataforma de casas particulares — API')
      .setDescription(
        'API de administración de relaciones laborales de personal de casas particulares. ' +
          'Los importes viajan como string decimal, nunca como number. ' +
          'La aplicación no solicita ni almacena claves fiscales de ARCA.',
      )
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();

    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, openapi), {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(config.PORT);
  logger.info(
    {
      port: config.PORT,
      env: config.NODE_ENV,
      arcaConnector: config.FEATURE_ARCA_OFFICIAL_CONNECTOR ? 'OFFICIAL' : 'MANUAL_ASSISTED',
    },
    'API iniciada',
  );
}

void bootstrap();
