import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@casas/database';

/**
 * Cliente Prisma como proveedor de Nest.
 *
 * Es el único punto donde se abre la conexión. Los repositorios lo reciben
 * inyectado; ningún módulo instancia su propio `PrismaClient`.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ log: ['warn', 'error'] });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/**
 * Cliente dentro de una transacción.
 *
 * Los servicios que escriben negocio y auditoría juntos reciben este tipo, no el
 * `PrismaService` completo: así el tipo impide llamar a `$transaction` anidado.
 */
export type PrismaTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
