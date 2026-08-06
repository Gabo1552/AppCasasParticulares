import { PaymentMethod, PaymentStatus, type CreatePaymentIntentInput } from '@casas/domain';
import { describe, expect, it, vi } from 'vitest';
import {
  ManualTransferProvider,
  type ManualTransferProviderDeps,
} from '../payments/manual-transfer.provider';

function buildDeps(
  overrides: Partial<ManualTransferProviderDeps> = {},
): ManualTransferProviderDeps {
  return {
    upsertPayment: vi.fn().mockResolvedValue({
      paymentId: '00000000-0000-4000-8000-0000000000pa',
      created: true,
      status: PaymentStatus.REGISTERED,
      createdAt: '2026-06-05T14:00:00.000Z',
    }),
    loadPayment: vi.fn().mockResolvedValue({
      paymentId: '00000000-0000-4000-8000-0000000000pa',
      status: PaymentStatus.REGISTERED,
      amount: '380000.00',
      externalReference: 'DEMO-TRANSFER-000001',
      proofDocumentId: null,
      registeredAt: '2026-06-05T14:00:00.000Z',
      confirmedAt: null,
    }),
    cancelPayment: vi.fn().mockResolvedValue({ cancelledAt: '2026-06-06T10:00:00.000Z' }),
    ...overrides,
  };
}

function buildInput(overrides: Partial<CreatePaymentIntentInput> = {}): CreatePaymentIntentInput {
  return {
    payrollPeriodId: '00000000-0000-4000-8000-0000000000p1',
    payrollVersionId: '00000000-0000-4000-8000-0000000000v1',
    employmentRelationshipId: '00000000-0000-4000-8000-0000000000e1',
    amount: '380000.00',
    currency: 'ARS',
    target: {
      kind: 'WORKER_BANK_ACCOUNT',
      workerId: '00000000-0000-4000-8000-0000000000w1',
      workerBankAccountId: '00000000-0000-4000-8000-0000000000b1',
      accountKind: 'CBU',
      last4: '5201',
    },
    method: PaymentMethod.MANUAL_TRANSFER,
    idempotencyKey: '00000000-0000-4000-8000-0000000000k1',
    initiatedByUserId: '00000000-0000-4000-8000-000000000101',
    ...overrides,
  };
}

describe('ManualTransferProvider', () => {
  it('registra el pago sin mover fondos por la plataforma', async () => {
    const provider = new ManualTransferProvider(buildDeps());
    const result = await provider.createPaymentIntent(buildInput());

    expect(result.fundsHeldByPlatform).toBe(false);
    expect(result.status).toBe(PaymentStatus.REGISTERED);
    expect(result.method).toBe(PaymentMethod.MANUAL_TRANSFER);
  });

  it('las instrucciones dicen explícitamente que el dinero va directo', async () => {
    const provider = new ManualTransferProvider(buildDeps());
    const result = await provider.createPaymentIntent(buildInput());

    const text = result.instructions.join(' ');
    expect(text).toContain('directo de tu cuenta a la de la trabajadora');
    expect(text).toContain('la plataforma no lo recibe');
  });

  it('sólo muestra la cuenta destino enmascarada (INV-PAGO-03)', async () => {
    const provider = new ManualTransferProvider(buildDeps());
    const result = await provider.createPaymentIntent(buildInput());

    const serialized = JSON.stringify(result);
    expect(serialized).toContain('5201');
    // No hay ningún camino que exponga un número de 22 dígitos.
    expect(/\d{22}/.test(serialized)).toBe(false);
  });

  it('propaga el importe como string decimal, nunca como number', async () => {
    const provider = new ManualTransferProvider(buildDeps());
    const result = await provider.createPaymentIntent(buildInput({ amount: '380000.1234' }));

    expect(typeof result.amount).toBe('string');
    expect(result.amount).toBe('380000.1234');
  });

  describe('idempotencia (PAG-07)', () => {
    it('pasa la clave de idempotencia al repositorio', async () => {
      const deps = buildDeps();
      const provider = new ManualTransferProvider(deps);

      await provider.createPaymentIntent(buildInput({ idempotencyKey: 'clave-fija' }));

      expect(deps.upsertPayment).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: 'clave-fija' }),
      );
    });

    it('un reintento con la misma clave devuelve el pago existente, no crea otro', async () => {
      const deps = buildDeps({
        upsertPayment: vi
          .fn()
          .mockResolvedValueOnce({
            paymentId: 'pago-1',
            created: true,
            status: PaymentStatus.REGISTERED,
            createdAt: '2026-06-05T14:00:00.000Z',
          })
          .mockResolvedValueOnce({
            paymentId: 'pago-1',
            created: false,
            status: PaymentStatus.REGISTERED,
            createdAt: '2026-06-05T14:00:00.000Z',
          }),
      });
      const provider = new ManualTransferProvider(deps);
      const input = buildInput();

      const first = await provider.createPaymentIntent(input);
      const second = await provider.createPaymentIntent(input);

      expect(second.paymentId).toBe(first.paymentId);
      expect(second.createdAt).toBe(first.createdAt);
    });
  });

  describe('el dinero no pasa por la plataforma', () => {
    it('rechaza un destino que no sea la cuenta de la trabajadora', async () => {
      const provider = new ManualTransferProvider(buildDeps());
      const input = buildInput();
      // Simula un dato corrupto que venga de la base: el tipo ya lo impide en
      // tiempo de compilación, la verificación cubre el runtime.
      const corrupted = {
        ...input,
        target: { ...input.target, kind: 'PLATFORM_ACCOUNT' },
      } as unknown as CreatePaymentIntentInput;

      await expect(provider.createPaymentIntent(corrupted)).rejects.toThrow(
        /sólo puede ser la cuenta de la trabajadora/,
      );
    });

    it('rechaza un método que este proveedor no implementa', async () => {
      const provider = new ManualTransferProvider(buildDeps());

      await expect(
        provider.createPaymentIntent(buildInput({ method: PaymentMethod.PSP_INITIATED })),
      ).rejects.toThrow(/proveedor habilitado/);
    });
  });

  describe('consulta y cancelación', () => {
    it('devuelve el estado del pago con su comprobante', async () => {
      const provider = new ManualTransferProvider(buildDeps());
      const result = await provider.getPaymentStatus({ paymentId: 'pago-1' });

      expect(result.status).toBe(PaymentStatus.REGISTERED);
      expect(result.externalReference).toBe('DEMO-TRANSFER-000001');
    });

    it('cancela un pago todavía no confirmado', async () => {
      const provider = new ManualTransferProvider(buildDeps());
      const result = await provider.cancelPayment({
        paymentId: 'pago-1',
        reason: 'Se cargó por error',
        cancelledByUserId: 'u1',
      });

      expect(result.status).toBe(PaymentStatus.CANCELLED);
    });

    it('no cancela un pago ya confirmado: correspondería una rectificación', async () => {
      const deps = buildDeps({
        loadPayment: vi.fn().mockResolvedValue({
          paymentId: 'pago-1',
          status: PaymentStatus.CONFIRMED,
          amount: '380000.00',
          externalReference: 'DEMO',
          proofDocumentId: null,
          registeredAt: '2026-06-05T14:00:00.000Z',
          confirmedAt: '2026-06-06T09:00:00.000Z',
        }),
      });
      const provider = new ManualTransferProvider(deps);

      await expect(
        provider.cancelPayment({
          paymentId: 'pago-1',
          reason: 'error',
          cancelledByUserId: 'u1',
        }),
      ).rejects.toThrow(/rectificación/);
      expect(deps.cancelPayment).not.toHaveBeenCalled();
    });
  });
});
