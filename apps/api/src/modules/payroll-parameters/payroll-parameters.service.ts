import { Injectable } from '@nestjs/common';
import { validateParameterVersion, type PayrollParameterVersion } from '@casas/payroll-engine';
import { PrismaService, type PrismaTx } from '../../common/prisma/prisma.service';
import { UnprocessableError } from '../../common/http/app.errors';

/**
 * Resolución de la versión de parámetros normativos que rige un período.
 *
 * La regla que este servicio hace cumplir es RN-02: **cada período se liquida con
 * la versión vigente en su propio rango**, no con la última publicada. Sin eso,
 * recalcular un período histórico después de una actualización de escalas
 * devolvería un resultado distinto del original, y una liquidación ya entregada
 * dejaría de ser reproducible.
 *
 * Los valores cargados hoy son de prueba. `isFixture` viaja hasta la UI para que
 * ningún importe se presente como oficial (docs/product-summary.md §10).
 */
@Injectable()
export class PayrollParametersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Devuelve la versión publicada que cubre el período completo.
   *
   * Exige cobertura de **todo** el rango, no sólo del primer día: una versión que
   * caduca a mitad de mes no puede liquidar ese mes entero.
   */
  async resolveForPeriod(
    fromDate: Date,
    toDate: Date,
    tx?: PrismaTx,
  ): Promise<{ id: string; isFixture: boolean; version: PayrollParameterVersion }> {
    const client = tx ?? this.prisma;

    const row = await client.payrollParameterVersion.findFirst({
      where: {
        status: 'PUBLISHED',
        effectiveFrom: { lte: fromDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: toDate } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (row === null) {
      throw new UnprocessableError(
        'PARAMETER_VERSION_NOT_FOUND',
        'No hay una versión de parámetros publicada que cubra todo el período. ' +
          'Un contador matriculado tiene que cargarla y publicarla antes de liquidar.',
      );
    }

    // El payload guarda el objeto que consume el motor tal cual. Se revalida acá
    // porque una fila puede haberse escrito por fuera del flujo de doble control.
    const version = row.payload as unknown as PayrollParameterVersion;
    const problems = validateParameterVersion(version);

    if (problems.length > 0) {
      throw new UnprocessableError(
        'PARAMETER_VERSION_INVALID',
        `La versión de parámetros "${row.label}" no es utilizable: ${problems.join('; ')}`,
      );
    }

    return { id: row.id, isFixture: row.isFixture, version };
  }
}
