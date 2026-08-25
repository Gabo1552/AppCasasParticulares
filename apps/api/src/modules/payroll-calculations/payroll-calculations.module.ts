import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PayrollParametersModule } from '../payroll-parameters/payroll-parameters.module';
import { PayrollCalculationsController } from './payroll-calculations.controller';
import { PayrollCalculationsService } from './payroll-calculations.service';

/**
 * Modulo PayrollCalculations.
 *
 * Paso 10 del recorrido vertical: invoca el motor puro y persiste la
 * preliquidacion con su traza. Requerimientos: LIQ-02, LIQ-04, LIQ-11, LIQ-14.
 */
@Module({
  imports: [PayrollParametersModule],
  controllers: [PayrollCalculationsController],
  providers: [PrismaService, AuditService, PayrollCalculationsService],
  exports: [PayrollCalculationsService],
})
export class PayrollCalculationsModule {}
