import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuditService } from '../common/audit/audit.service';
import { AccessTokenService } from '../common/auth/access-token.service';
import { CsrfGuard } from '../common/auth/csrf.guard';
import { SessionGuard } from '../common/auth/session.guard';
import { FieldEncryptionService } from '../common/crypto/field-encryption.service';
import { TokenService } from '../common/crypto/token.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { APP_CONFIG, loadAppConfig, type AppConfig } from '../config/app-config';
import { IdentityController } from './identity/identity.controller';
import { LegalController } from './legal/legal.controller';
import { IdentityService } from './identity/identity.service';
import { RedisSessionRevocationService } from './identity/redis-session-revocation.service';
import { EmployersService } from './employers/employers.service';
import { WorkersService } from './workers/workers.service';
import { HouseholdsService } from './households/households.service';
import { InvitationsService } from './employment-relationships/invitations.service';
import { RelationshipsService } from './employment-relationships/relationships.service';
import { WorkSchedulesService } from './work-schedules/work-schedules.service';
import { NotificationsService } from './notifications/notifications.service';
import { OutboxNotificationService } from './notifications/outbox-notification.service';
import { OutboxProcessorWorker } from './notifications/outbox-processor.worker';
import { TestNotificationSink } from './notifications/test-notification-sink';
import { TestSupportController } from './test-support/test-support.controller';
import {
  EmployerProfileController,
  EmploymentRelationshipsController,
  HouseholdsController,
  WorkerInvitationsController,
  WorkerProfileController,
} from './onboarding.controllers';

const guards: Provider[] = [
  { provide: APP_GUARD, useClass: SessionGuard },
  { provide: APP_GUARD, useClass: CsrfGuard },
];

/**
 * ¿Corresponde exponer los endpoints de apoyo a las pruebas?
 *
 * Las dos condiciones son necesarias. Rechazar la request en tiempo de ejecución
 * no alcanza: mientras el controlador esté declarado, Nest le mapea rutas y esas
 * rutas existen en producción, aparecen en el árbol de rutas y en OpenAPI. La
 * única forma de que no existan es no registrarlo.
 */
export function isTestSupportEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['NODE_ENV'] === 'test' && env['FEATURE_TEST_SUPPORT_ENDPOINTS'] === 'true';
}

@Module({})
export class OnboardingModule {
  /**
   * Se registra como módulo dinámico para que la decisión sobre test-support se
   * tome al construir la aplicación y no al importar el archivo. Con un `@Module`
   * estático, la condición se evaluaría en tiempo de carga del módulo y una
   * prueba no podría verificar los distintos entornos.
   */
  static register(env: NodeJS.ProcessEnv = process.env): DynamicModule {
    const testSupportEnabled = isTestSupportEnabled(env);

    return {
      module: OnboardingModule,
      imports: [JwtModule.register({})],
      controllers: [
        IdentityController,
        LegalController,
        EmployerProfileController,
        WorkerProfileController,
        HouseholdsController,
        WorkerInvitationsController,
        EmploymentRelationshipsController,
        // Fuera de NODE_ENV=test no existe: sin ruta, sin handler, sin entrada
        // en OpenAPI.
        ...(testSupportEnabled ? [TestSupportController] : []),
      ],
      providers: [
        { provide: APP_CONFIG, useFactory: (): AppConfig => loadAppConfig() },
        PrismaService,
        AuditService,
        TokenService,
        AccessTokenService,
        FieldEncryptionService,
        RedisSessionRevocationService,
        OutboxNotificationService,
        OutboxProcessorWorker,
        // El sumidero guarda códigos de acceso en memoria. Sólo se registra
        // junto con test-support; `NotificationsService` lo inyecta como
        // opcional justamente para poder funcionar sin él.
        ...(testSupportEnabled ? [TestNotificationSink] : []),
        NotificationsService,
        IdentityService,
        EmployersService,
        WorkersService,
        HouseholdsService,
        InvitationsService,
        RelationshipsService,
        WorkSchedulesService,
        ...guards,
      ],
      exports: [PrismaService, APP_CONFIG, RedisSessionRevocationService, NotificationsService],
    };
  }
}
