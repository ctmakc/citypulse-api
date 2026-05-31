import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getSummary(tenantId: string) {
    const [assets, alerts, reports, workOrders] = await Promise.all([
      this.prisma.asset.count({ where: { tenantId } }),
      this.prisma.alert.count({ where: { tenantId, acknowledged: false } }),
      this.prisma.report311.count({ where: { tenantId, status: { not: 'CLOSED' } } }),
      this.prisma.workOrder.count({ where: { tenantId, status: { not: 'COMPLETED' } } }),
    ]);
    return { assets, openAlerts: alerts, activeReports: reports, activeWorkOrders: workOrders };
  }
}
