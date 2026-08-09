import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildKeyring,
  decryptField,
  encryptField,
  FieldEncryptionConfigError,
  FieldEncryptionUnknownKeyError,
} from '../field-encryption';
import { loadAppConfig } from '../../../config/app-config';

const V1 = randomBytes(32).toString('base64');
const V2 = randomBytes(32).toString('base64');

describe('Keyring de cifrado de campos', () => {
  describe('rotación', () => {
    it('descifra con la clave anterior después de rotar a una nueva', () => {
      const soloV1 = buildKeyring(`v1:${V1}`, 'v1');
      const cifradoConV1 = encryptField(soloV1, '123456');

      // Rotación: entra v2 como activa y v1 se conserva en el keyring.
      const rotado = buildKeyring(`v1:${V1},v2:${V2}`, 'v2');

      expect(decryptField(rotado, cifradoConV1)).toBe('123456');
    });

    it('los payloads nuevos se cifran con la clave activa', () => {
      const rotado = buildKeyring(`v1:${V1},v2:${V2}`, 'v2');
      const nuevo = encryptField(rotado, '654321');

      expect(nuevo.startsWith('v2:')).toBe(true);

      // Y sigue siendo legible: la rotación no rompe el ida y vuelta.
      expect(decryptField(rotado, nuevo)).toBe('654321');
    });

    it('un keyId que no está en el keyring falla diciendo exactamente eso', () => {
      const soloV1 = buildKeyring(`v1:${V1}`, 'v1');
      const cifradoConV2 = encryptField(buildKeyring(`v2:${V2}`, 'v2'), '111111');

      expect(() => decryptField(soloV1, cifradoConV2)).toThrow(FieldEncryptionUnknownKeyError);
      expect(() => decryptField(soloV1, cifradoConV2)).toThrow(/v2/);
    });
  });

  describe('el ciphertext no filtra el contenido', () => {
    it('el payload no contiene el texto en claro', () => {
      const keyring = buildKeyring(`v1:${V1}`, 'v1');
      const cifrado = encryptField(keyring, '987654');

      expect(cifrado).not.toContain('987654');
    });

    it('dos cifrados del mismo valor son distintos: el IV es aleatorio', () => {
      const keyring = buildKeyring(`v1:${V1}`, 'v1');

      expect(encryptField(keyring, '123456')).not.toBe(encryptField(keyring, '123456'));
    });
  });

  describe('integridad', () => {
    it('un auth tag corrupto hace fallar el descifrado', () => {
      const keyring = buildKeyring(`v1:${V1}`, 'v1');
      const [keyId, iv, tag, content] = encryptField(keyring, '123456').split(':') as [
        string,
        string,
        string,
        string,
      ];

      // Se altera un byte del tag manteniendo el largo.
      const corrupted = Buffer.from(tag, 'base64');
      corrupted[0] = corrupted[0]! ^ 0xff;
      const alterado = [keyId, iv, corrupted.toString('base64'), content].join(':');

      expect(() => decryptField(keyring, alterado)).toThrow();
    });

    it('un ciphertext alterado hace fallar el descifrado', () => {
      const keyring = buildKeyring(`v1:${V1}`, 'v1');
      const [keyId, iv, tag, content] = encryptField(keyring, '123456').split(':') as [
        string,
        string,
        string,
        string,
      ];

      const corrupted = Buffer.from(content, 'base64');
      corrupted[0] = corrupted[0]! ^ 0xff;
      const alterado = [keyId, iv, tag, corrupted.toString('base64')].join(':');

      expect(() => decryptField(keyring, alterado)).toThrow();
    });

    it('un payload con formato inesperado se rechaza', () => {
      const keyring = buildKeyring(`v1:${V1}`, 'v1');

      expect(() => decryptField(keyring, 'v1:solo:dos')).toThrow(FieldEncryptionConfigError);
    });
  });

  describe('validación de claves', () => {
    it('rechaza una clave que no decodifica a 32 bytes', () => {
      const corta = randomBytes(16).toString('base64');

      expect(() => buildKeyring(`v1:${corta}`, 'v1')).toThrow(FieldEncryptionConfigError);
      expect(() => buildKeyring(`v1:${corta}`, 'v1')).toThrow(/16 bytes/);
    });

    it('rechaza una clave larga en vez de recortarla', () => {
      const larga = randomBytes(64).toString('base64');

      expect(() => buildKeyring(`v1:${larga}`, 'v1')).toThrow(FieldEncryptionConfigError);
    });

    it('rechaza que la clave activa no esté definida', () => {
      expect(() => buildKeyring(`v1:${V1}`, 'v9')).toThrow(/v9/);
    });

    it('rechaza identificadores repetidos', () => {
      expect(() => buildKeyring(`v1:${V1},v1:${V2}`, 'v1')).toThrow(/más de una vez/);
    });

    it('rechaza una entrada sin el formato "<keyId>:<base64>"', () => {
      expect(() => buildKeyring(V1, 'v1')).toThrow(FieldEncryptionConfigError);
    });

    it('el mensaje de error no incluye material de clave', () => {
      const corta = randomBytes(8).toString('base64');
      try {
        buildKeyring(`sinSeparador${corta}`, 'v1');
        expect.unreachable('debería haber lanzado');
      } catch (error) {
        expect((error as Error).message).not.toContain(corta);
      }
    });
  });

  describe('arranque de la aplicación', () => {
    const baseEnv: Record<string, string> = {
      NODE_ENV: 'test',
      API_BASE_URL: 'http://localhost:3001',
      WEB_BASE_URL: 'http://localhost:3000',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
      DATABASE_URL: 'postgresql://casas:test@localhost:5432/casas_test',
      REDIS_URL: 'redis://localhost:6379',
      STORAGE_ENDPOINT: 'http://localhost:9000',
      STORAGE_REGION: 'us-east-1',
      STORAGE_BUCKET: 'casas-documents',
      STORAGE_ACCESS_KEY: 'test_access',
      STORAGE_SECRET_KEY: 'test_secret',
      JWT_ACCESS_SECRET: 'test-only-access-secret-con-mas-de-32-caracteres',
      JWT_REFRESH_SECRET: 'test-only-refresh-secret-con-mas-de-32-caracteres',
      FIELD_ENCRYPTION_KEY: 'test-only-field-encryption-key-32-chars',
      FIELD_ENCRYPTION_ACTIVE_KEY_ID: 'v1',
    };

    it('una clave de largo inválido impide el arranque', () => {
      expect(() =>
        loadAppConfig({
          ...baseEnv,
          FIELD_ENCRYPTION_KEYS: `v1:${randomBytes(16).toString('base64')}`,
        }),
      ).toThrow(FieldEncryptionConfigError);
    });

    it('una clave activa inexistente impide el arranque', () => {
      expect(() =>
        loadAppConfig({
          ...baseEnv,
          FIELD_ENCRYPTION_KEYS: `v2:${V2}`,
        }),
      ).toThrow(/v1/);
    });

    it('un keyring válido deja arrancar', () => {
      const config = loadAppConfig({ ...baseEnv, FIELD_ENCRYPTION_KEYS: `v1:${V1}` });

      expect(config.FIELD_ENCRYPTION_ACTIVE_KEY_ID).toBe('v1');
    });
  });
});
