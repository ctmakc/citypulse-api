import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 200 }]),
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
  ],
})
export class AppModule {}
