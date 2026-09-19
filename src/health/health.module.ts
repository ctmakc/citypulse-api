import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

/**
 * HealthModule exposes the public GET /health (+ /health/ready, /health/live)
 * endpoints. Self-contained: it imports PrismaModule for the DB probe and uses
 * a short-lived ioredis client for the Redis probe, so the hardening agent can
 * register it in AppModule with a single `imports: [HealthModule]` line.
 */
@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
