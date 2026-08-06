import { Module, type Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuditService } from '../common/audit/audit.service';
import { AccessTokenService } from '../common/auth/access-token.service';
import { CsrfGuard } from '../common/auth/csrf.guard';
import { SessionGuard } from '../common/auth/session.guard';
import { TokenService } from '../common/crypto/token.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { APP_CONFIG, loadAppConfig, type AppConfig } from '../config/app-config';
import { IdentityController } from './identity/identity.controller';
import { LegalController } from './legal/legal.controller';
import { IdentityService } from './identity/identity.service';
import { EmployersService } from './employers/employers.service';
import { WorkersService } from './workers/workers.service';
import { HouseholdsService } from './households/households.service';
import { InvitationsService } from './employment-relationships/invitations.service';
import { RelationshipsService } from './employment-relationships/relationships.service';
import { WorkSchedulesService } from './work-schedules/work-schedules.service';
import { NotificationsService } from './notifications/notifications.service';
import { TestSupportController } from './test-support/test-support.controller';
import {
  EmployerProfileController,
  EmploymentRelationshipsController,
  HouseholdsController,
  WorkerInvitationsController,
  WorkerProfileController,
} from './onboarding.controllers';

const config = loadAppConfig();

/**
 * Módulo del recorrido de onboarding (Etapa 3, pasos 1 a 6).
 *
 * Agrupa identity, users, employers, workers, households,
 * employment-relationships, work-schedules, notifications y audit. Están juntos
 * porque comparten el mismo recorrido y separarlos en nueve módulos de Nest sólo
 * agregaría wiring: los límites que importan son los de código, ya expresados en
 * carpetas y servicios.
 *
 * El controlador de apoyo para pruebas se registra **sólo** si el flag está
 * encendido, y el flag no puede estar encendido en producción.
 */
const testSupportControllers = config.FEATURE_TEST_SUPPORT_ENDPOINTS ? [TestSupportController] : [];

const guards: Provider[] = [
  { provide: APP_GUARD, useClass: SessionGuard },
  { provide: APP_GUARD, useClass: CsrfGuard },
];

@Module({
  imports: [JwtModule.register({})],
  controllers: [
    IdentityController,
    LegalController,
    EmployerProfileController,
    WorkerProfileController,
    HouseholdsController,
    WorkerInvitationsController,
    EmploymentRelationshipsController,
    ...testSupportControllers,
  ],
  providers: [
    { provide: APP_CONFIG, useFactory: (): AppConfig => config },
    PrismaService,
    AuditService,
    TokenService,
    AccessTokenService,
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
  exports: [PrismaService, APP_CONFIG],
})
export class OnboardingModule {}
