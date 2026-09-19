import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bull';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import type { ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { buildBullRootOptions } from './queue/redis-options';
import { AuditModule } from './audit/audit.module';
import { AuditInterceptor } from './audit/audit.interceptor';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { AssetsModule } from './assets/assets.module';
import { AlertsModule } from './alerts/alerts.module';
import { Reports311Module } from './reports311/reports311.module';
import { CapitalModule } from './capital/capital.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';
import { AgentsModule } from './agents/agents.module';
import { EnvironmentModule } from './environment/environment.module';
import { TrafficModule } from './traffic/traffic.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReportsModule } from './reports/reports.module';
import { ImportModule } from './import/import.module';
import { NotificationsModule } from './notifications/notifications.module';

/**
 * Global rate-limit guard. Subclasses the stock ThrottlerGuard purely to exempt
 * the health endpoints (load balancers / uptime probes hit /health on a tight
 * interval and must never be throttled). Everything else gets the 200/min limit
 * configured on ThrottlerModule below.
 */
@Injectable()
export class HealthAwareThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<{ originalUrl?: string; url?: string; path?: string }>();
    const url = req?.originalUrl ?? req?.url ?? req?.path ?? '';
    // Matches /health, /api/v1/health, /api/v1/health/ready, /api/v1/health/live
    if (/(^|\/)health(\/|\?|$)/.test(url)) return true;
    return super.shouldSkip(context);
  }
}

@Module({
  imports: [
    // Validate the environment at boot (fail fast on missing/invalid required
    // vars). `validateEnv` returns the parsed, defaulted, typed config.
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 200 }]),
    ScheduleModule.forRoot(),
    // Bull root config points at Redis (localhost:6387). ioredis is configured
    // to reconnect indefinitely with bounded backoff and to NOT throw on connect
    // failure, so a Redis outage degrades gracefully instead of crashing boot.
    BullModule.forRoot(buildBullRootOptions()),
    PrismaModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    AssetsModule,
    AlertsModule,
    Reports311Module,
    CapitalModule,
    WorkOrdersModule,
    AgentsModule,
    EnvironmentModule,
    TrafficModule,
    DashboardModule,
    ReportsModule,
    ImportModule,
    NotificationsModule,
    AuditModule,
    HealthModule,
    QueueModule.register(),
  ],
  providers: [
    // Global audit-trail interceptor: writes an AuditLog row for every
    // successful mutating request. Never throws (failures are swallowed).
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
    // Global rate limiter — every route is throttled (200 req/min per IP, per
    // the ThrottlerModule config) except the /health probes. Composes cleanly
    // with the audit interceptor above; both are plain providers.
    {
      provide: APP_GUARD,
      useClass: HealthAwareThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
