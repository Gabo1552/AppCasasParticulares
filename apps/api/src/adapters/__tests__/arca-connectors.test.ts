import { ARCAIntegrationNotEnabledError, ReceiptDifferenceClass } from '@casas/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ManualAssistedARCAConnector,
  compareConcepts,
  type ManualAssistedARCAConnectorDeps,
} from '../arca/manual-assisted-arca.connector';
import { OfficialARCAConnector } from '../arca/official-arca.connector';

function buildDeps(
  overrides: Partial<ManualAssistedARCAConnectorDeps> = {},
): ManualAssistedARCAConnectorDeps {
  return {
    resolveOfficialLink: vi.fn().mockResolvedValue('https://www.arca.gob.ar/casasparticulares/'),
    loadDeclaredRelationshipStatus: vi
      .fn()
      .mockResolvedValue({ registered: true, declaredAt: '2026-01-20T12:00:00.000Z' }),
    loadEstimatedObligations: vi.fn().mockResolvedValue([
      {
        code: 'FIXTURE_APORTE_A',
        label: 'Aporte de prueba A',
        estimatedAmount: '12000.00',
        dueDate: '2026-06-10',
        status: 'PENDING',
      },
    ]),
    loadPayrollValues: vi.fn().mockResolvedValue([
      { code: 'BASE_MONTHLY', label: 'Remuneración mensual', amount: '400000.00' },
      { code: 'SENIORITY', label: 'Antigüedad', amount: '12000.00' },
    ]),
    persistTask: vi.fn().mockResolvedValue('00000000-0000-4000-8000-0000000000t1'),
    loadImportedDocument: vi.fn().mockResolvedValue({
      employmentRelationshipId: '00000000-0000-4000-8000-0000000000e1',
      payrollPeriodId: '00000000-0000-4000-8000-0000000000p1',
      objectKey: 'documents/demo/recibo.pdf',
      sha256: 'a'.repeat(64),
      contentType: 'application/pdf',
      validationStatus: 'VALID' as const,
      extractedConcepts: [
        { code: 'BASE_MONTHLY', amount: '400000.00' },
        { code: 'SENIORITY', amount: '12000.00' },
      ],
      qrPayload: 'demo-qr-payload',
    }),
    createSignedDownload: vi.fn().mockResolvedValue({
      url: 'https://storage.local/firmada',
      expiresAt: '2026-06-01T12:05:00Z',
    }),
    roundingToleranceAmount: '1.00',
    ...overrides,
  };
}

describe('ManualAssistedARCAConnector', () => {
  // El principio 6 prohíbe automatizar ARCA. La prueba lo verifica de la única
  // forma útil: reemplazando `fetch` por un doble que falla, de modo que
  // cualquier salida de red durante las operaciones rompa la prueba.
  const originalFetch = globalThis.fetch;
  const fetchSpy = vi.fn(() => {
    throw new Error(
      'El conector asistido no puede hacer llamadas de red hacia ARCA (principio 6).',
    );
  });

  beforeEach(() => {
    fetchSpy.mockClear();
    (globalThis as { fetch: unknown }).fetch = fetchSpy;
  });

  afterEach(() => {
    (globalThis as { fetch: unknown }).fetch = originalFetch;
  });

  it('no realiza ninguna llamada de red en ninguna operación', async () => {
    const connector = new ManualAssistedARCAConnector(buildDeps());

    await connector.getRelationshipStatus({ employmentRelationshipId: 'e1' });
    await connector.getObligations({
      employmentRelationshipId: 'e1',
      period: { year: 2026, month: 5, periodType: 'MONTHLY' },
    });
    await connector.createReceipt({ payrollPeriodId: 'p1', payrollVersionId: 'v1' });
    await connector.downloadReceipt({ arcaDocumentId: 'd1', requestedByUserId: 'u1' });
    await connector.validateReceipt({ arcaDocumentId: 'd1', payrollVersionId: 'v1' });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('declara que el estado de la relación lo informa el usuario, no ARCA', async () => {
    const connector = new ManualAssistedARCAConnector(buildDeps());
    const result = await connector.getRelationshipStatus({ employmentRelationshipId: 'e1' });

    expect(result.sourceOfTruth).toBe('USER_DECLARED');
    expect(result.registrationChecklist.length).toBeGreaterThan(0);
    expect(result.officialLinkUrl).toContain('arca.gob.ar');
  });

  it('marca las obligaciones como estimadas de la plataforma', async () => {
    const connector = new ManualAssistedARCAConnector(buildDeps());
    const result = await connector.getObligations({
      employmentRelationshipId: 'e1',
      period: { year: 2026, month: 5, periodType: 'MONTHLY' },
    });

    expect(result.sourceOfTruth).toBe('PLATFORM_ESTIMATE');
    expect(result.obligations.every((o) => o.isEstimate === true)).toBe(true);
  });

  describe('createReceipt prepara la emisión, no la ejecuta', () => {
    it('devuelve una tarea con checklist y valores a informar, no un documento', async () => {
      const connector = new ManualAssistedARCAConnector(buildDeps());
      const result = await connector.createReceipt({
        payrollPeriodId: 'p1',
        payrollVersionId: 'v1',
      });

      expect(result.receiptIssuedByPlatform).toBe(false);
      expect(result.taskType).toBe('RECEIPT_ISSUANCE');
      expect(result.status).toBe('PENDING');
      expect(result.checklist.length).toBe(5);
      expect(result.checklist.every((item) => item.completed === false)).toBe(true);
      expect(result).not.toHaveProperty('documentId');
      expect(result).not.toHaveProperty('pdf');
    });

    it('el checklist advierte que la aplicación nunca pide la clave fiscal', async () => {
      const connector = new ManualAssistedARCAConnector(buildDeps());
      const result = await connector.createReceipt({
        payrollPeriodId: 'p1',
        payrollVersionId: 'v1',
      });

      const allText = result.checklist.map((i) => `${i.label} ${i.helpText}`).join(' ');
      expect(allText).toContain('nunca te pide la clave fiscal');
      expect(allText).toContain('Esta aplicación no emite recibos');
    });

    it('los valores a informar llevan la etiqueta del formulario oficial (ARC-04)', async () => {
      const connector = new ManualAssistedARCAConnector(buildDeps());
      const result = await connector.createReceipt({
        payrollPeriodId: 'p1',
        payrollVersionId: 'v1',
      });

      expect(result.preparedValues).toEqual([
        {
          fieldKey: 'BASE_MONTHLY',
          officialLabel: 'Remuneración mensual',
          value: '400000.00',
          kind: 'MONEY',
        },
        { fieldKey: 'SENIORITY', officialLabel: 'Antigüedad', value: '12000.00', kind: 'MONEY' },
      ]);
    });
  });

  describe('validateReceipt', () => {
    it('no reporta diferencias cuando el recibo coincide', async () => {
      const connector = new ManualAssistedARCAConnector(buildDeps());
      const result = await connector.validateReceipt({
        arcaDocumentId: 'd1',
        payrollVersionId: 'v1',
      });

      expect(result.differences).toHaveLength(0);
      expect(result.blocking).toBe(false);
      expect(result.formatValid).toBe(true);
    });

    it('bloquea y no inventa datos si el PDF no se puede leer', async () => {
      const deps = buildDeps({
        loadImportedDocument: vi.fn().mockResolvedValue({
          employmentRelationshipId: 'e1',
          payrollPeriodId: 'p1',
          objectKey: 'documents/demo/ilegible.pdf',
          sha256: 'b'.repeat(64),
          contentType: 'application/pdf',
          validationStatus: 'UNREADABLE' as const,
          extractedConcepts: null,
          qrPayload: null,
        }),
      });
      const connector = new ManualAssistedARCAConnector(deps);

      const result = await connector.validateReceipt({
        arcaDocumentId: 'd1',
        payrollVersionId: 'v1',
      });

      expect(result.blocking).toBe(true);
      expect(result.differences[0]?.differenceClass).toBe(ReceiptDifferenceClass.UNREADABLE);
      expect(result.differences[0]?.found).toBeNull();
      expect(result.differences[0]?.expected).toBeNull();
    });
  });

  it('downloadReceipt entrega una URL firmada de vida corta, no descarga de ARCA', async () => {
    const deps = buildDeps();
    const connector = new ManualAssistedARCAConnector(deps);

    const result = await connector.downloadReceipt({
      arcaDocumentId: 'd1',
      requestedByUserId: 'u1',
    });

    expect(deps.createSignedDownload).toHaveBeenCalledWith('documents/demo/recibo.pdf', 300);
    expect(result.signedUrl).toBe('https://storage.local/firmada');
    expect(result.sha256).toHaveLength(64);
  });
});

describe('Comparación de conceptos (ARC-07)', () => {
  const expected = [
    { code: 'BASE_MONTHLY', label: 'Remuneración mensual', amount: '400000.00' },
    { code: 'SENIORITY', label: 'Antigüedad', amount: '12000.00' },
  ];

  it('no reporta diferencias ante coincidencia exacta', () => {
    const differences = compareConcepts(
      expected,
      [
        { code: 'BASE_MONTHLY', amount: '400000.00' },
        { code: 'SENIORITY', amount: '12000.00' },
      ],
      '1.00',
    );
    expect(differences).toHaveLength(0);
  });

  it('clasifica una diferencia dentro de la tolerancia como redondeo y no bloquea', () => {
    const differences = compareConcepts(
      expected,
      [
        { code: 'BASE_MONTHLY', amount: '399999.50' },
        { code: 'SENIORITY', amount: '12000.00' },
      ],
      '1.00',
    );

    expect(differences).toHaveLength(1);
    expect(differences[0]?.differenceClass).toBe(ReceiptDifferenceClass.ROUNDING);
    expect(differences[0]?.blocking).toBe(false);
  });

  it('bloquea una diferencia de importe fuera de tolerancia', () => {
    const differences = compareConcepts(
      expected,
      [
        { code: 'BASE_MONTHLY', amount: '380000.00' },
        { code: 'SENIORITY', amount: '12000.00' },
      ],
      '1.00',
    );

    expect(differences[0]?.differenceClass).toBe(ReceiptDifferenceClass.AMOUNT_MISMATCH);
    expect(differences[0]?.blocking).toBe(true);
    expect(differences[0]?.delta).toBe('20000.0000');
  });

  it('bloquea un concepto de la preliquidación ausente en el recibo', () => {
    const differences = compareConcepts(
      expected,
      [{ code: 'BASE_MONTHLY', amount: '400000.00' }],
      '1.00',
    );

    expect(differences).toHaveLength(1);
    expect(differences[0]?.differenceClass).toBe(ReceiptDifferenceClass.CONCEPT_MISMATCH);
    expect(differences[0]?.blocking).toBe(true);
  });

  it('bloquea un concepto del recibo ausente en la preliquidación', () => {
    const differences = compareConcepts(
      expected,
      [
        { code: 'BASE_MONTHLY', amount: '400000.00' },
        { code: 'SENIORITY', amount: '12000.00' },
        { code: 'CONCEPTO_INESPERADO', amount: '5000.00' },
      ],
      '1.00',
    );

    expect(differences).toHaveLength(1);
    expect(differences[0]?.conceptCode).toBe('CONCEPTO_INESPERADO');
    expect(differences[0]?.blocking).toBe(true);
  });
});

describe('OfficialARCAConnector (deshabilitado)', () => {
  const connector = new OfficialARCAConnector();

  it('se identifica como el conector oficial', () => {
    expect(connector.kind).toBe('OFFICIAL');
  });

  it.each([
    ['getRelationshipStatus', () => connector.getRelationshipStatus()],
    ['getObligations', () => connector.getObligations()],
    ['createReceipt', () => connector.createReceipt()],
    ['downloadReceipt', () => connector.downloadReceipt()],
    ['validateReceipt', () => connector.validateReceipt()],
  ])('%s lanza un error controlado, no devuelve datos simulados', (operation, call) => {
    expect(call).toThrow(ARCAIntegrationNotEnabledError);

    try {
      call();
    } catch (error: unknown) {
      const typed = error as ARCAIntegrationNotEnabledError;
      expect(typed.code).toBe('ARCA_INTEGRATION_NOT_ENABLED');
      expect(typed.context['operation']).toBe(operation);
      expect(typed.message).toContain('no está habilitada');
    }
  });
});
