import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_PARAMETERS_H1_2026 } from '@casas/payroll-engine';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import { UnprocessableError } from '../../../common/http/app.errors';
import { PayrollParametersService } from '../payroll-parameters.service';

/**
 * Resolución de la versión de parámetros que rige un período.
 *
 * La regla de fondo es RN-02: cada período se liquida con la versión vigente en
 * **su** rango, no con la última publicada. Si esto se rompiera, recalcular un
 * período viejo después de una actualización de escalas daría un número distinto
 * del que la familia ya vio y la trabajadora ya cobró.
 */

const FROM = new Date('2026-05-01T00:00:00.000Z');
const TO = new Date('2026-05-31T00:00:00.000Z');

describe('PayrollParametersService', () => {
  let prisma: { payrollParameterVersion: { findFirst: ReturnType<typeof vi.fn> } };
  let service: PayrollParametersService;

  beforeEach(() => {
    prisma = { payrollParameterVersion: { findFirst: vi.fn() } };
    service = new PayrollParametersService(prisma as unknown as PrismaService);
  });

  it('devuelve la versión publicada que cubre el período', async () => {
    prisma.payrollParameterVersion.findFirst.mockResolvedValue({
      id: 'param-1',
      label: 'H1 2026',
      isFixture: true,
      payload: FIXTURE_PARAMETERS_H1_2026,
    });

    const resolved = await service.resolveForPeriod(FROM, TO);

    expect(resolved.id).toBe('param-1');
    expect(resolved.version.id).toBe(FIXTURE_PARAMETERS_H1_2026.id);
  });

  it('exige que la versión esté PUBLISHED y cubra el rango completo', async () => {
    prisma.payrollParameterVersion.findFirst.mockResolvedValue({
      id: 'param-1',
      label: 'H1 2026',
      isFixture: true,
      payload: FIXTURE_PARAMETERS_H1_2026,
    });

    await service.resolveForPeriod(FROM, TO);

    const where = prisma.payrollParameterVersion.findFirst.mock.calls[0]![0].where as {
      status: string;
      effectiveFrom: { lte: Date };
      OR: unknown[];
    };

    expect(where.status).toBe('PUBLISHED');
    // El inicio de vigencia debe ser anterior al primer día del período...
    expect(where.effectiveFrom.lte).toEqual(FROM);
    // ...y la caducidad, posterior al último: una versión que vence a mitad de
    // mes no puede liquidar el mes entero.
    expect(where.OR).toEqual([{ effectiveTo: null }, { effectiveTo: { gte: TO } }]);
  });

  it('elige la más reciente cuando hay varias que cubren el período', async () => {
    prisma.payrollParameterVersion.findFirst.mockResolvedValue({
      id: 'param-1',
      label: 'H1 2026',
      isFixture: true,
      payload: FIXTURE_PARAMETERS_H1_2026,
    });

    await service.resolveForPeriod(FROM, TO);

    expect(prisma.payrollParameterVersion.findFirst.mock.calls[0]![0].orderBy).toEqual({
      effectiveFrom: 'desc',
    });
  });

  it('falla con un mensaje accionable si no hay versión que cubra el período', async () => {
    prisma.payrollParameterVersion.findFirst.mockResolvedValue(null);

    await expect(service.resolveForPeriod(FROM, TO)).rejects.toThrow(UnprocessableError);
    await expect(service.resolveForPeriod(FROM, TO)).rejects.toThrow(/contador matriculado/);
  });

  it('rechaza una versión cuyo payload no pasa la validación del motor', async () => {
    // Una fila puede haberse escrito por fuera del flujo de doble control: se
    // revalida antes de usarla para calcular dinero.
    prisma.payrollParameterVersion.findFirst.mockResolvedValue({
      id: 'param-roto',
      label: 'Rota',
      isFixture: true,
      payload: { ...FIXTURE_PARAMETERS_H1_2026, categories: [] },
    });

    await expect(service.resolveForPeriod(FROM, TO)).rejects.toThrow(/no es utilizable/);
  });

  it('propaga isFixture para que la UI no presente el importe como oficial', async () => {
    prisma.payrollParameterVersion.findFirst.mockResolvedValue({
      id: 'param-1',
      label: 'H1 2026',
      isFixture: true,
      payload: FIXTURE_PARAMETERS_H1_2026,
    });

    expect((await service.resolveForPeriod(FROM, TO)).isFixture).toBe(true);
  });
});
