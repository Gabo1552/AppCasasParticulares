import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createLogger } from '@casas/observability';
import { AppModule } from './app.module';
import { APP_CONFIG, type AppConfig } from './config/app-config';
import { configureApp } from './app-setup';

/**
 * Arranque de la API.
 *
 * Los controles de seguridad se aplican de manera global en `configureApp`, y no
 * controlador por controlador: es la diferencia entre una garantía y una
 * convención (docs/security-model.md §5).
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get<AppConfig>(APP_CONFIG);
  const logger = createLogger({
    level: config.LOG_LEVEL,
    pretty: config.NODE_ENV === 'development',
  });

  configureApp(app, config);

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
