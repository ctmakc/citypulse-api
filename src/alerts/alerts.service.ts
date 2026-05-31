import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAlertDto } from './dto/create-alert.dto';
import { AlertFiltersDto } from './dto/alert-filters.dto';
import { Severity } from '@prisma/client';

@Injectable()
export class AlertsService {
  constructor(private prisma: PrismaService) {}

  findAll(tenantId: string, filters?: AlertFiltersDto) {
    const where: Record<string, unknown> = { tenantId };

    if (filters?.severity) where['severity'] = filters.severity;
    if (filters?.category) where['category'] = filters.category;
    if (filters?.department) where['department'] = filters.department;
    if (filters?.acknowledged !== undefined) where['acknowledged'] = filters.acknowledged;
    if (filters?.unresolved) where['resolvedAt'] = null;

    return this.prisma.alert.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async findById(tenantId: string, id: string) {
    const alert = await this.prisma.alert.findFirst({ where: { id, tenantId } });
    if (!alert) throw new NotFoundException(`Alert ${id} not found`);
    return alert;
  }

  create(tenantId: string, dto: CreateAlertDto) {
    return this.prisma.alert.create({
      data: { tenantId, ...dto },
    });
  }

  async acknowledge(tenantId: string, id: string) {
    await this.findById(tenantId, id);
    return this.prisma.alert.update({
      where: { id },
      data: { acknowledged: true },
    });
  }

  async resolve(tenantId: string, id: string) {
    await this.findById(tenantId, id);
    return this.prisma.alert.update({
      where: { id },
      data: { resolvedAt: new Date(), acknowledged: true },
    });
  }

  async getStats(tenantId: string) {
    const [critical, elevated, watch, total] = await Promise.all([
      this.prisma.alert.count({
        where: { tenantId, severity: Severity.CRITICAL, resolvedAt: null },
      }),
      this.prisma.alert.count({
        where: { tenantId, severity: Severity.HIGH, resolvedAt: null },
      }),
      this.prisma.alert.count({
        where: { tenantId, severity: Severity.MEDIUM, resolvedAt: null },
      }),
      this.prisma.alert.count({
        where: { tenantId, resolvedAt: null },
      }),
    ]);

    return { critical, elevated, watch, total };
  }
}
