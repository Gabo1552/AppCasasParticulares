import { describe, expect, it } from 'vitest';
import { REDACTED, maskAccountNumber, redact } from '../redaction';

describe('Redacción de datos sensibles', () => {
  it('borra credenciales por nombre de campo', () => {
    const input = {
      email: 'demo@ejemplo-ficticio.test',
      password: 'no-deberia-aparecer',
      passwordHash: '$argon2id$...',
      refreshToken: 'rt_no-deberia-aparecer',
    };

    const output = redact(input) as Record<string, unknown>;

    expect(output['email']).toBe('demo@ejemplo-ficticio.test');
    expect(output['password']).toBe(REDACTED);
    expect(output['passwordHash']).toBe(REDACTED);
    expect(output['refreshToken']).toBe(REDACTED);
  });

  it('borra el campo de clave fiscal aunque el sistema no deba tenerlo (SEG-06)', () => {
    // El sistema no tiene este campo. La regla existe para que, si alguna vez
    // aparece por un error, no llegue a un log.
    const output = redact({ claveFiscal: 'xxx', clave_fiscal: 'yyy' }) as Record<string, unknown>;

    expect(output['claveFiscal']).toBe(REDACTED);
    expect(output['clave_fiscal']).toBe(REDACTED);
  });

  it('borra datos bancarios y de identidad', () => {
    const output = redact({
      cbu: '2850590940090418135201',
      cvu: '0000003100010000000001',
      cuil: '20-00000000-0',
      numberCipher: 'algo',
    }) as Record<string, unknown>;

    expect(Object.values(output).every((v) => v === REDACTED)).toBe(true);
  });

  it('detecta un CBU dentro de un campo con nombre inocente', () => {
    const output = redact({
      note: 'La familia transfirió a la cuenta 2850590940090418135201 el día 5.',
    }) as Record<string, unknown>;

    expect(output['note']).not.toContain('2850590940090418135201');
    expect(output['note']).toContain(REDACTED);
  });

  it('detecta un JWT y un header Bearer en texto libre', () => {
    const jwt = 'eyJhbGciOi.eyJzdWIiOi.SflKxwRJSM';
    const output = redact({
      detail: `Falló con el token ${jwt}`,
      header: 'Bearer abc123.def456-ghi',
    }) as Record<string, unknown>;

    expect(output['detail']).not.toContain(jwt);
    expect(output['header']).toBe(REDACTED);
  });

  it('recorre objetos anidados y arreglos', () => {
    const output = redact({
      user: { name: 'Demo', password: 'x' },
      accounts: [{ cbu: '1' }, { alias: 'demo.alias' }],
    }) as Record<string, Record<string, unknown>>;

    expect((output['user'] as Record<string, unknown>)['password']).toBe(REDACTED);
    const accounts = output['accounts'] as unknown as Record<string, unknown>[];
    expect(accounts[0]?.['cbu']).toBe(REDACTED);
    expect(accounts[1]?.['alias']).toBe('demo.alias');
  });

  it('no muta la entrada', () => {
    const input = { password: 'secreto' };
    redact(input);
    expect(input.password).toBe('secreto');
  });

  it('soporta referencias circulares sin colgarse', () => {
    const input: Record<string, unknown> = { name: 'demo' };
    input['self'] = input;

    const output = redact(input) as Record<string, unknown>;
    expect(output['self']).toBe('[CICLO]');
  });

  it('serializa errores sin exponer el stack', () => {
    const output = redact(new Error('Falló con Bearer abc.def-ghi')) as Record<string, unknown>;

    expect(output['name']).toBe('Error');
    expect(output['message']).not.toContain('abc.def-ghi');
    expect(output['stack']).toBeUndefined();
  });
});

describe('Enmascarado de cuentas', () => {
  it('deja sólo los últimos 4 dígitos', () => {
    expect(maskAccountNumber('2850590940090418135201')).toBe(`${'•'.repeat(18)}5201`);
  });

  it('redacta por completo un valor demasiado corto para enmascarar', () => {
    expect(maskAccountNumber('12')).toBe(REDACTED);
  });
});
