import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter } as any);
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    const adapter = new PrismaPg({ connectionString: url });
    super({ adapter } as any);
  }

  async onModuleInit() {
    await this.$connect();
  }
}

// keep unused import happy in ESLint
void createPrismaClient;
