import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import {
  buildKeyring,
  decryptField,
  encryptField,
  type FieldEncryptionKeyring,
} from './field-encryption';

/**
 * Punto único de construcción del keyring.
 *
 * Se arma una sola vez al instanciar el servicio: las claves ya fueron validadas
 * por `loadAppConfig`, así que acá no puede fallar por configuración.
 */
@Injectable()
export class FieldEncryptionService {
  private readonly keyring: FieldEncryptionKeyring;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.keyring = buildKeyring(
      config.FIELD_ENCRYPTION_KEYS,
      config.FIELD_ENCRYPTION_ACTIVE_KEY_ID,
    );
  }

  /** Identificador de la clave con la que se cifra en este momento. */
  get activeKeyId(): string {
    return this.keyring.activeKeyId;
  }

  encrypt(plaintext: string): string {
    return encryptField(this.keyring, plaintext);
  }

  decrypt(payload: string): string {
    return decryptField(this.keyring, payload);
  }
}
