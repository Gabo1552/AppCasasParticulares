import { Inject, Injectable, Logger, OnModuleDestroy, UnauthorizedException } from '@nestjs/common';
import Redis from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { ACCESS_TOKEN_TTL_SECONDS } from '../../common/auth/access-token.service';

/**
 * Registro de sesiones revocadas en Redis (docs/security-model.md §2).
 *
 * Permite la revocación inmediata de un access token JWT antes de su expiración.
 * Ante indisponibilidad de Redis en operaciones autenticadas, aplica la estrategia
 * fail-closed (prioriza la seguridad sobre aceptar una sesión no verificable).
 */
@Injectable()
export class RedisSessionRevocationService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisSessionRevocationService.name);
  private client: Redis | null = null;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.initClient();
  }

  private initClient(): void {
    try {
      this.client = new Redis(this.config.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });

      this.client.on('error', (err) => {
        this.logger.error(`Error en conexión con Redis: ${err.message}`);
      });
    } catch (error) {
      this.logger.error(`Fallo al inicializar cliente Redis: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => {});
    }
  }

  /**
   * Revoca una sesión por su ID guardando la clave en Redis con TTL >= vida del access token.
   */
  async revokeSession(sessionId: string, ttlSeconds = ACCESS_TOKEN_TTL_SECONDS): Promise<void> {
    if (!this.client) return;
    try {
      if (this.client.status !== 'ready' && this.client.status !== 'connecting') {
        await this.client.connect().catch(() => {});
      }
      await this.client.set(`revoked_session:${sessionId}`, '1', 'EX', ttlSeconds);
    } catch (error) {
      this.logger.error(
        `Error al revocar sesión ${sessionId} en Redis: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Revoca un listado de sesiones en Redis.
   */
  async revokeSessions(sessionIds: string[], ttlSeconds = ACCESS_TOKEN_TTL_SECONDS): Promise<void> {
    if (!this.client || sessionIds.length === 0) return;
    try {
      if (this.client.status !== 'ready' && this.client.status !== 'connecting') {
        await this.client.connect().catch(() => {});
      }
      const pipeline = this.client.pipeline();
      for (const id of sessionIds) {
        pipeline.set(`revoked_session:${id}`, '1', 'EX', ttlSeconds);
      }
      await pipeline.exec();
    } catch (error) {
      this.logger.error(`Error al revocar lote de sesiones en Redis: ${(error as Error).message}`);
    }
  }

  /**
   * Comprueba si una sessionId fue revocada.
   *
   * Si Redis no responde o falla, lanza UnauthorizedException (fail-closed por seguridad).
   */
  async isSessionRevoked(sessionId: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      if (this.client.status !== 'ready' && this.client.status !== 'connecting') {
        await this.client.connect();
      }
      const val = await this.client.get(`revoked_session:${sessionId}`);
      return val === '1';
    } catch (error) {
      this.logger.error(
        `Redis no disponible durante la verificación de sesión: ${(error as Error).message}`,
      );
      throw new UnauthorizedException({
        code: 'AUTH_SESSION_VERIFICATION_FAILED',
        message: 'No se pudo verificar el estado de la sesión por un problema de conectividad.',
      });
    }
  }
}
