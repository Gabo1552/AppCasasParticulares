import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { ACCESS_TOKEN_TTL_SECONDS } from '../../common/auth/access-token.service';

/**
 * Resultado de consultar la denylist.
 *
 * `UNKNOWN` existe porque "Redis no contestó" no es lo mismo que "la sesión no
 * está revocada". Colapsar esos dos casos es lo que hacía que un fallo transitorio
 * de Redis decidiera el acceso, en un sentido o en el otro.
 */
export type RevocationState = 'REVOKED' | 'NOT_REVOKED' | 'UNKNOWN';

/**
 * Denylist de sesiones en Redis (docs/security-model.md §2).
 *
 * **No es la fuente de verdad.** Lo es la tabla `session` en PostgreSQL, que
 * `SessionGuard` consulta en cada request. Redis acorta la ventana entre revocar y
 * que el access token deje de servir, y evita el viaje a la base en el caso
 * frecuente; que se caiga degrada el rendimiento, no la seguridad.
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
   * Anota la sesión en la denylist.
   *
   * Devuelve `false` si Redis no pudo registrarla. El llamador ya escribió
   * `revokedAt` en PostgreSQL dentro de su transacción, así que la revocación es
   * efectiva igual: lo que se pierde es la propagación inmediata, y eso se
   * registra en el log en vez de silenciarse.
   */
  async revokeSession(sessionId: string, ttlSeconds = ACCESS_TOKEN_TTL_SECONDS): Promise<boolean> {
    return this.revokeSessions([sessionId], ttlSeconds);
  }

  async revokeSessions(
    sessionIds: string[],
    ttlSeconds = ACCESS_TOKEN_TTL_SECONDS,
  ): Promise<boolean> {
    if (sessionIds.length === 0) return true;
    if (!this.client) return false;

    try {
      await this.ensureConnected();
      const pipeline = this.client.pipeline();
      for (const id of sessionIds) {
        pipeline.set(`revoked_session:${id}`, '1', 'EX', ttlSeconds);
      }
      const results = await pipeline.exec();
      const failed = (results ?? []).filter(([error]) => error !== null);
      if (failed.length > 0) {
        this.logger.warn(
          `${failed.length} de ${sessionIds.length} sesiones no se anotaron en la denylist de ` +
            'Redis. Siguen revocadas en PostgreSQL, que es lo que verifica el guard.',
        );
        return false;
      }
      return true;
    } catch (error) {
      this.logger.warn(
        `No se pudo anotar la revocación en Redis: ${(error as Error).message}. ` +
          'La revocación en PostgreSQL sigue siendo efectiva.',
      );
      return false;
    }
  }

  /**
   * Consulta la denylist sin decidir por sí sola.
   *
   * Nunca lanza: si Redis no responde devuelve `UNKNOWN` y es el guard quien
   * resuelve contra PostgreSQL. Antes lanzaba 401, lo que rechazaba sesiones
   * perfectamente válidas por un problema de conectividad.
   */
  async getRevocationState(sessionId: string): Promise<RevocationState> {
    if (!this.client) return 'UNKNOWN';
    try {
      await this.ensureConnected();
      const value = await this.client.get(`revoked_session:${sessionId}`);
      return value === '1' ? 'REVOKED' : 'NOT_REVOKED';
    } catch (error) {
      this.logger.warn(
        `Redis no disponible al consultar la denylist: ${(error as Error).message}. ` +
          'Se resuelve contra PostgreSQL.',
      );
      return 'UNKNOWN';
    }
  }

  /** Comprobación de conectividad para el readiness. Lanza si Redis no responde. */
  async ping(): Promise<void> {
    if (!this.client) throw new Error('El cliente de Redis no se pudo inicializar.');
    await this.ensureConnected();
    await this.client.ping();
  }

  private async ensureConnected(): Promise<void> {
    if (this.client === null) throw new Error('El cliente de Redis no se pudo inicializar.');
    if (this.client.status !== 'ready' && this.client.status !== 'connecting') {
      await this.client.connect();
    }
  }
}
