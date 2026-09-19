import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditInterceptor } from './audit.interceptor';

/**
 * AuditModule
 *
 * Provides the audit-trail read API (AuditController + AuditService) and exports
 * the AuditInterceptor so AppModule can register it globally via APP_INTERCEPTOR.
 * PrismaService is global, but PrismaModule is imported here for explicitness.
 */
@Module({
  imports: [PrismaModule],
  controllers: [AuditController],
  providers: [AuditService, AuditInterceptor],
  exports: [AuditService, AuditInterceptor],
})
export class AuditModule {}
