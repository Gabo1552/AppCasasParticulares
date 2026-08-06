import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';

/**
 * Generación y verificación de códigos y tokens.
 *
 * Dos primitivas distintas, por dos amenazas distintas:
 *
 *  - **Código OTP**: seis dígitos, entropía baja. Se protege con HMAC-SHA256 y un
 *    pepper del servidor, de modo que ni con la base filtrada se pueda revertir el
 *    código por fuerza bruta offline sin conocer el secreto. La defensa principal
 *    igual es operativa: expiración corta, límite de intentos y rate limiting.
 *
 *  - **Token de sesión o de invitación**: 32 bytes aleatorios, entropía alta. Un
 *    SHA-256 alcanza: no hay diccionario posible contra 256 bits.
 *
 * En ningún caso se persiste el valor en claro.
 */
@Injectable()
export class TokenService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /** Código numérico de 6 dígitos, con la aleatoriedad del sistema. */
  generateOtpCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  /**
   * HMAC del código, ligado al destino para que un código no sirva en otra cuenta.
   */
  hashOtpCode(code: string, destination: string): string {
    return createHmac('sha256', this.config.FIELD_ENCRYPTION_KEY)
      .update(`${destination.toLowerCase()}:${code}`)
      .digest('hex');
  }

  verifyOtpCode(code: string, destination: string, storedHash: string): boolean {
    return constantTimeEquals(this.hashOtpCode(code, destination), storedHash);
  }

  /** Token opaco de alta entropía, seguro para URLs. */
  generateOpaqueToken(): string {
    return randomBytes(32).toString('base64url');
  }

  hashOpaqueToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  verifyOpaqueToken(token: string, storedHash: string): boolean {
    return constantTimeEquals(this.hashOpaqueToken(token), storedHash);
  }
}

/**
 * Comparación en tiempo constante.
 *
 * Comparar hashes con `===` filtra información por el tiempo de respuesta: un
 * atacante puede ir descubriendo el prefijo correcto midiendo latencias.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
