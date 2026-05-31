import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { BullModule } from '@nestjs/bull';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { ThrottlerModule } from '@nestjs/throttler';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
    QueueModule.register(),
  ],
  providers: [
    // Global audit-trail interceptor: writes an AuditLog row for every
    // successful mutating request. Never throws (failures are swallowed).
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
