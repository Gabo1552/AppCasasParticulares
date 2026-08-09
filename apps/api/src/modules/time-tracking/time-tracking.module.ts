import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { FieldEncryptionService } from '../../common/crypto/field-encryption.service';
import { APP_CONFIG, loadAppConfig, type AppConfig } from '../../config/app-config';
import { OutboxNotificationService } from '../notifications/outbox-notification.service';
import { TimeTrackingController } from './time-tracking.controller';
import { TimeTrackingService } from './time-tracking.service';

/**
 * Módulo TimeTracking.
 *
 * Fichaje de entrada y salida, idempotencia, consulta y aprobación de jornadas.
 * Requerimientos: E3.7, FIC-01..FIC-05, FIC-07.
 */
@Module({
  imports: [],
  controllers: [TimeTrackingController],
  providers: [
    { provide: APP_CONFIG, useFactory: (): AppConfig => loadAppConfig() },
    PrismaService,
    AuditService,
    FieldEncryptionService,
    OutboxNotificationService,
    TimeTrackingService,
  ],
  exports: [TimeTrackingService],
})
export class TimeTrackingModule {}
