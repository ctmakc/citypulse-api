import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Alert, RiskLevel, Severity, WorkOrderStatus } from '@prisma/client';

export interface Kpi {
  key: string;
  label: string;
  value: string | number;
  sub: string;
  status: 'ok' | 'warn' | 'critical' | 'info';
  trend: 'up' | 'down' | 'flat';
}

export interface RecommendedAction {
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  text: string;
  impact: string;
  dept: string;
}

export interface DashboardOverview {
  tenant: {
    id: string;
    name: string;
    riskScore: number;
    riskLabel: string;
    population: number | null;
  };
  kpis: Kpi[];
  alerts: Alert[];
  actions: RecommendedAction[];
  riskScore: number;
}

// Helpers -----------------------------------------------------------------

function kpiStatus(value: number, warnThreshold: number, critThreshold: number): Kpi['status'] {
  if (value >= critThreshold) return 'critical';
  if (value >= warnThreshold) return 'warn';
  return 'ok';
}

function genActions(
  criticalAssets: number,
  unresolvedAlerts: number,
  overdueWOs: number,
): RecommendedAction[] {
  const actions: RecommendedAction[] = [];

  if (criticalAssets > 0) {
    actions.push({
      priority: 'HIGH',
      text: `Inspect ${criticalAssets} critical-risk asset${criticalAssets > 1 ? 's' : ''} immediately`,
      impact: 'Prevents potential service failure and public safety hazard',
      dept: 'Public Works',
    });
  }

  if (unresolvedAlerts > 0) {
    actions.push({
      priority: unresolvedAlerts >= 5 ? 'HIGH' : 'MEDIUM',
      text: `Review and acknowledge ${unresolvedAlerts} active alert${unresolvedAlerts > 1 ? 's' : ''}`,
      impact: 'Clears operational backlog and ensures nothing is missed',
      dept: 'City Manager',
    });
  }

  if (overdueWOs > 0) {
    actions.push({
      priority: 'MEDIUM',
      text: `${overdueWOs} work order${overdueWOs > 1 ? 's are' : ' is'} past due — escalate or reschedule`,
      impact: 'Reduces deferred maintenance liability',
      dept: 'Maintenance',
    });
  }

  if (actions.length === 0) {
    actions.push({
      priority: 'LOW',
      text: 'All systems nominal — continue routine inspection schedule',
      impact: 'Maintains current infrastructure health score',
      dept: 'Operations',
    });
  }

  return actions;
}

// Service -----------------------------------------------------------------

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getOverview(tenantId: string): Promise<DashboardOverview> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);

    const now = new Date();

    const [
      totalAssets,
      criticalAssets,
      elevatedAssets,
      watchAssets,
      unresolvedAlerts,
      criticalAlerts,
      openReports,
      activeWOs,
      overdueWOs,
      latestAlerts,
    ] = await Promise.all([
      this.prisma.asset.count({ where: { tenantId } }),
      this.prisma.asset.count({ where: { tenantId, riskLevel: RiskLevel.CRITICAL } }),
      this.prisma.asset.count({ where: { tenantId, riskLevel: RiskLevel.ELEVATED } }),
      this.prisma.asset.count({ where: { tenantId, riskLevel: RiskLevel.WATCH } }),
      this.prisma.alert.count({ where: { tenantId, acknowledged: false, resolvedAt: null } }),
      this.prisma.alert.count({
        where: { tenantId, acknowledged: false, resolvedAt: null, severity: Severity.CRITICAL },
      }),
      this.prisma.report311.count({
        where: { tenantId, status: { notIn: ['RESOLVED', 'CLOSED'] } },
      }),
      this.prisma.workOrder.count({
        where: { tenantId, status: { notIn: [WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED] } },
      }),
      this.prisma.workOrder.count({
        where: {
          tenantId,
          status: { notIn: [WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED] },
          dueDate: { lt: now },
        },
      }),
      this.prisma.alert.findMany({
        where: { tenantId, resolvedAt: null },
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        take: 10,
      }),
    ]);

    const atRiskPct = totalAssets > 0 ? Math.round(((criticalAssets + elevatedAssets) / totalAssets) * 100) : 0;

    const kpis: Kpi[] = [
      {
        key: 'total_assets',
        label: 'Total Assets',
        value: totalAssets,
        sub: `${watchAssets} on watch`,
        status: 'info',
        trend: 'flat',
      },
      {
        key: 'critical_assets',
        label: 'Critical Risk Assets',
        value: criticalAssets,
        sub: `${elevatedAssets} elevated`,
        status: kpiStatus(criticalAssets, 1, 5),
        trend: criticalAssets > 0 ? 'up' : 'flat',
      },
      {
        key: 'at_risk_pct',
        label: 'At-Risk Assets',
        value: `${atRiskPct}%`,
        sub: `${criticalAssets + elevatedAssets} of ${totalAssets} assets`,
        status: kpiStatus(atRiskPct, 10, 25),
        trend: atRiskPct > 10 ? 'up' : 'flat',
      },
      {
        key: 'active_alerts',
        label: 'Active Alerts',
        value: unresolvedAlerts,
        sub: `${criticalAlerts} critical`,
        status: kpiStatus(unresolvedAlerts, 3, 10),
        trend: unresolvedAlerts > 0 ? 'up' : 'flat',
      },
      {
        key: 'open_reports',
        label: 'Open 311 Reports',
        value: openReports,
        sub: 'citizen submissions',
        status: kpiStatus(openReports, 20, 50),
        trend: openReports > 20 ? 'up' : 'flat',
      },
      {
        key: 'active_work_orders',
        label: 'Active Work Orders',
        value: activeWOs,
        sub: `${overdueWOs} overdue`,
        status: kpiStatus(overdueWOs, 1, 5),
        trend: overdueWOs > 0 ? 'up' : 'flat',
      },
      {
        key: 'risk_score',
        label: 'City Risk Score',
        value: tenant.riskScore,
        sub: tenant.riskLabel,
        status:
          tenant.riskScore >= 80
            ? 'critical'
            : tenant.riskScore >= 60
              ? 'warn'
              : tenant.riskScore >= 40
                ? 'warn'
                : 'ok',
        trend: tenant.riskScore >= 40 ? 'up' : 'flat',
      },
    ];

    const actions = genActions(criticalAssets, unresolvedAlerts, overdueWOs);

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        riskScore: tenant.riskScore,
        riskLabel: tenant.riskLabel,
        population: tenant.population,
      },
      kpis,
      alerts: latestAlerts,
      actions,
      riskScore: tenant.riskScore,
    };
  }

  async getAlerts(tenantId: string): Promise<Alert[]> {
    return this.prisma.alert.findMany({
      where: { tenantId, resolvedAt: null, acknowledged: false },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async acknowledgeAlert(tenantId: string, alertId: string): Promise<Alert> {
    const alert = await this.prisma.alert.findFirst({
      where: { id: alertId, tenantId },
    });
    if (!alert) throw new NotFoundException(`Alert ${alertId} not found`);

    return this.prisma.alert.update({
      where: { id: alertId },
      data: { acknowledged: true },
    });
  }
}
