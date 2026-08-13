import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { FieldEncryptionService } from '../../common/crypto/field-encryption.service';
import { APP_CONFIG, loadAppConfig, type AppConfig } from '../../config/app-config';
import { OutboxNotificationService } from '../notifications/outbox-notification.service';
import { PayrollPeriodsController } from './payroll-periods.controller';
import { PayrollPeriodsService } from './payroll-periods.service';

/**
 * Módulo PayrollPeriods.
 *
 * Ciclo del período mensual y cierre de asistencia inmutable con snapshot.
 * Requerimientos: E3.9, LIQ-01, LIQ-12.
 */
@Module({
  imports: [],
  controllers: [PayrollPeriodsController],
  providers: [
    { provide: APP_CONFIG, useFactory: (): AppConfig => loadAppConfig() },
    PrismaService,
    AuditService,
    FieldEncryptionService,
    OutboxNotificationService,
    PayrollPeriodsService,
  ],
  exports: [PayrollPeriodsService],
})
export class PayrollPeriodsModule {}
