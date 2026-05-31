import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Tenant } from '@prisma/client';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  async findAll(): Promise<Tenant[]> {
    return this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string): Promise<Tenant> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
    return tenant;
  }

  async create(dto: CreateTenantDto): Promise<Tenant> {
    return this.prisma.tenant.create({ data: dto });
  }

  async update(id: string, dto: UpdateTenantDto): Promise<Tenant> {
    await this.findById(id);
    return this.prisma.tenant.update({ where: { id }, data: dto });
  }

  async getStats(tenantId: string): Promise<{
    assetCount: number;
    alertCount: number;
    openReports: number;
    riskScore: number;
  }> {
    const tenant = await this.findById(tenantId);

    const [assetCount, alertCount, openReports] = await Promise.all([
      this.prisma.asset.count({ where: { tenantId } }),
      this.prisma.alert.count({ where: { tenantId, resolvedAt: null } }),
      this.prisma.report311.count({
        where: {
          tenantId,
          status: { notIn: ['RESOLVED', 'CLOSED'] },
        },
      }),
    ]);

    return {
      assetCount,
      alertCount,
      openReports,
      riskScore: tenant.riskScore,
    };
  }

  /**
   * Recalculates riskScore from active alerts:
   *  CRITICAL = +30 pts each (cap 90)
   *  HIGH     = +15 pts each
   *  MEDIUM   = +8  pts each
   *  LOW      = +2  pts each
   * Final score is clamped to [0, 100].
   */
  async updateRiskScore(tenantId: string): Promise<Tenant> {
    await this.findById(tenantId);

    const alerts = await this.prisma.alert.findMany({
      where: { tenantId, resolvedAt: null },
      select: { severity: true },
    });

    const weights: Record<string, number> = {
      CRITICAL: 30,
      HIGH: 15,
      MEDIUM: 8,
      LOW: 2,
    };

    const raw = alerts.reduce((acc, a) => acc + (weights[a.severity] ?? 0), 0);
    const riskScore = Math.min(100, Math.max(0, raw));

    const riskLabel =
      riskScore >= 80
        ? 'Critical'
        : riskScore >= 60
          ? 'Elevated'
          : riskScore >= 40
            ? 'Watch'
            : riskScore >= 20
              ? 'Moderate'
              : 'Normal';

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { riskScore, riskLabel },
    });
  }
}
