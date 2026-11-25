import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

// Usa il driver adapter Neon per Prisma 6.
// Vantaggio: nessun query-engine binary (che crasha su Node 26 runtime Vercel);
// il driver @neondatabase/serverless è JS puro via WebSocket/HTTP.
//
// IMPORTANTE: usa la connection string UNPOOLED (DIRECT_URL) perché l'adapter
// Neon gestisce internamente il pooling WebSocket (no PgBouncer).
//
// PrismaNeon è una FACTORY: accetta PoolConfig, Prisma chiama connect() internamente.

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Prisma');

  constructor() {
    const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('PrismaService: DIRECT_URL o DATABASE_URL non impostata');
    }

    // PrismaNeon(config: PoolConfig) — factory, Prisma 6 chiama connect() internamente
    const adapter = new PrismaNeon({ connectionString });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connesso a PostgreSQL via Neon adapter');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
