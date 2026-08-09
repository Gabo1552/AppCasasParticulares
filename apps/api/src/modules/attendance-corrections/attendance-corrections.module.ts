import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { FieldEncryptionService } from '../../common/crypto/field-encryption.service';
import { APP_CONFIG, loadAppConfig, type AppConfig } from '../../config/app-config';
import { OutboxNotificationService } from '../notifications/outbox-notification.service';
import { AttendanceCorrectionsController } from './attendance-corrections.controller';
import { AttendanceCorrectionsService } from './attendance-corrections.service';

/**
 * Módulo AttendanceCorrections.
 *
 * Solicitud, revisión, aprobación y rechazo de correcciones de jornada.
 * Requerimientos: E3.8, FIC-06, FIC-07.
 */
@Module({
  imports: [],
  controllers: [AttendanceCorrectionsController],
  providers: [
    { provide: APP_CONFIG, useFactory: (): AppConfig => loadAppConfig() },
    PrismaService,
    AuditService,
    FieldEncryptionService,
    OutboxNotificationService,
    AttendanceCorrectionsService,
  ],
  exports: [AttendanceCorrectionsService],
})
export class AttendanceCorrectionsModule {}
