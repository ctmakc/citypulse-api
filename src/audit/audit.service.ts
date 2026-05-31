import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ListAuditOptions {
  entity?: string;
  limit?: number;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recent AuditLog rows for a tenant, most recent first.
   * `limit` defaults to 50 and is clamped to [1, 200].
   */
  async list(tenantId: string, opts: ListAuditOptions = {}) {
    const take = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    return this.prisma.auditLog.findMany({
      where: {
        tenantId,
        ...(opts.entity ? { entity: opts.entity } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
