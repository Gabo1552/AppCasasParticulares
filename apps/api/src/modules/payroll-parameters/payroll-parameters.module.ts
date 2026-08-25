import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PayrollParametersService } from './payroll-parameters.service';

/**
 * Módulo PayrollParameters.
 *
 * Sirve la versión de parámetros normativos que rige cada período (RN-01, RN-02,
 * LIQ-04). La administración de versiones con doble control (ADM-02, CON-11)
 * llega en la Etapa 4.
 */
@Module({
  controllers: [],
  providers: [PrismaService, PayrollParametersService],
  exports: [PayrollParametersService],
})
export class PayrollParametersModule {}
