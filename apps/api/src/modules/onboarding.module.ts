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

const config = loadAppConfig();

const testSupportControllers = config.FEATURE_TEST_SUPPORT_ENDPOINTS ? [TestSupportController] : [];
const testSupportProviders: Provider[] = config.FEATURE_TEST_SUPPORT_ENDPOINTS
  ? [TestNotificationSink]
  : [];

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
    RedisSessionRevocationService,
    OutboxNotificationService,
    OutboxProcessorWorker,
    NotificationsService,
    IdentityService,
    EmployersService,
    WorkersService,
    HouseholdsService,
    InvitationsService,
    RelationshipsService,
    WorkSchedulesService,
    ...testSupportProviders,
    ...guards,
  ],
  exports: [PrismaService, APP_CONFIG, RedisSessionRevocationService, NotificationsService],
})
export class OnboardingModule {}
