import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RiskLevel, Severity } from '@prisma/client';
import type { ReportType } from './reports.types.js';

/**
 * Shapes returned to the document/spreadsheet builders. Everything here is
 * sourced from Prisma for the given tenant and ordered deterministically so the
 * rendered artifact body is stable for a given dataset (only the passed
 * generation timestamp varies).
 */

export interface TenantHeader {
  id: string;
  name: string;
  type: string;
  country: string;
  population: number | null;
  riskScore: number;
  riskLabel: string;
}

export interface AlertRow {
  severity: Severity;
  category: string;
  title: string;
  department: string | null;
  location: string | null;
  acknowledged: boolean;
}

export interface PriorityAction {
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  text: string;
  dept: string;
}

export interface GrantProjectRow {
  title: string;
  cost: number;
  grantProgram: string | null;
  grantEligibility: string | null;
  grantMatch: string | null;
  probability: number | null;
  status: string;
  urgency: string | null;
}

export interface GrantSummary {
  totalProjects: number;
  totalCost: number;
  /** Cost-weighted expected (probability-adjusted) value of the pipeline. */
  expectedValue: number;
  avgProbability: number;
  projects: GrantProjectRow[];
}

export interface RiskBreakdown {
  ok: number;
  watch: number;
  elevated: number;
  critical: number;
  total: number;
}

export interface AssetRow {
  name: string;
  type: string;
  district: string | null;
  department: string | null;
  condition: number;
  failureProb: number;
  riskLevel: RiskLevel;
  replacementCost: number | null;
}

export interface WorkOrderRow {
  title: string;
  department: string | null;
  priority: string;
  status: string;
  assignee: string | null;
  dueDate: string | null;
}

export interface Report311Row {
  category: string;
  severity: Severity;
  status: string;
  location: string;
  department: string | null;
  createdAt: string;
}

export interface EnvReadingRow {
  metric: string;
  value: number;
  unit: string | null;
  district: string | null;
}

@Injectable()
export class ReportDataService {
  constructor(private readonly prisma: PrismaService) {}

  async tenantHeader(tenantId: string): Promise<TenantHeader> {
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!t) throw new NotFoundException(`Tenant ${tenantId} not found`);
    return {
      id: t.id,
      name: t.name,
      type: t.type,
      country: t.country,
      population: t.population,
      riskScore: t.riskScore,
      riskLabel: t.riskLabel,
    };
  }

  /** Top open alerts, worst severity first, newest first within a severity. */
  async topAlerts(tenantId: string, take = 8): Promise<AlertRow[]> {
    const sevRank: Record<Severity, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
    };
    const alerts = await this.prisma.alert.findMany({
      where: { tenantId, resolvedAt: null },
      orderBy: [{ createdAt: 'desc' }],
    });
    return alerts
      .sort(
        (a, b) =>
          sevRank[a.severity] - sevRank[b.severity] ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      )
      .slice(0, take)
      .map((a) => ({
        severity: a.severity,
        category: a.category,
        title: a.title,
        department: a.department,
        location: a.location,
        acknowledged: a.acknowledged,
      }));
  }

  async riskBreakdown(tenantId: string): Promise<RiskBreakdown> {
    const grouped = await this.prisma.asset.groupBy({
      by: ['riskLevel'],
      where: { tenantId },
      _count: { _all: true },
    });
    const by = (lvl: RiskLevel) =>
      grouped.find((g) => g.riskLevel === lvl)?._count._all ?? 0;
    const ok = by(RiskLevel.OK);
    const watch = by(RiskLevel.WATCH);
    const elevated = by(RiskLevel.ELEVATED);
    const critical = by(RiskLevel.CRITICAL);
    return {
      ok,
      watch,
      elevated,
      critical,
      total: ok + watch + elevated + critical,
    };
  }

  async grantSummary(tenantId: string): Promise<GrantSummary> {
    const projects = await this.prisma.capitalProject.findMany({
      where: { tenantId },
      orderBy: [{ cost: 'desc' }, { title: 'asc' }],
    });
    let totalCost = 0;
    let expectedValue = 0;
    let probSum = 0;
    let probCount = 0;
    const rows: GrantProjectRow[] = projects.map((p) => {
      const cost = p.cost ?? 0;
      totalCost += cost;
      if (p.probability != null) {
        expectedValue += cost * p.probability;
        probSum += p.probability;
        probCount += 1;
      }
      return {
        title: p.title,
        cost,
        grantProgram: p.grantProgram,
        grantEligibility: p.grantEligibility,
        grantMatch: p.grantMatch,
        probability: p.probability,
        status: p.status,
        urgency: p.urgency,
      };
    });
    return {
      totalProjects: projects.length,
      totalCost,
      expectedValue,
      avgProbability: probCount ? probSum / probCount : 0,
      projects: rows,
    };
  }

  /** Highest-risk assets first (CRITICAL → OK), then worst condition. */
  async riskiestAssets(tenantId: string, take = 50): Promise<AssetRow[]> {
    const assets = await this.prisma.asset.findMany({
      where: { tenantId },
      orderBy: [{ failureProb: 'desc' }, { condition: 'asc' }, { name: 'asc' }],
      take,
    });
    return assets.map((a) => ({
      name: a.name,
      type: a.type,
      district: a.district,
      department: a.department,
      condition: a.condition,
      failureProb: a.failureProb,
      riskLevel: a.riskLevel,
      replacementCost: a.replacementCost,
    }));
  }

  async assetConditionAverages(
    tenantId: string,
  ): Promise<{ avgCondition: number; avgFailureProb: number }> {
    const agg = await this.prisma.asset.aggregate({
      where: { tenantId },
      _avg: { condition: true, failureProb: true },
    });
    return {
      avgCondition: Math.round(agg._avg.condition ?? 0),
      avgFailureProb: Number((agg._avg.failureProb ?? 0).toFixed(3)),
    };
  }

  async workOrders(
    tenantId: string,
    take = 200,
    department?: string,
  ): Promise<WorkOrderRow[]> {
    const wos = await this.prisma.workOrder.findMany({
      where: { tenantId, ...(department ? { department } : {}) },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take,
    });
    return wos.map((w) => ({
      title: w.title,
      department: w.department,
      priority: w.priority,
      status: w.status,
      assignee: w.assignee,
      dueDate: w.dueDate ? w.dueDate.toISOString().slice(0, 10) : null,
    }));
  }

  async reports311(
    tenantId: string,
    take = 200,
    department?: string,
  ): Promise<Report311Row[]> {
    const reports = await this.prisma.report311.findMany({
      where: { tenantId, ...(department ? { department } : {}) },
      orderBy: [{ createdAt: 'desc' }],
      take,
    });
    return reports.map((r) => ({
      category: r.category,
      severity: r.severity,
      status: r.status,
      location: r.location,
      department: r.department,
      createdAt: r.createdAt.toISOString().slice(0, 10),
    }));
  }

  /** Latest reading per metric, deterministic by metric name. */
  async environmentSnapshot(tenantId: string): Promise<EnvReadingRow[]> {
    const readings = await this.prisma.environmentalReading.findMany({
      where: { tenantId },
      orderBy: [{ recordedAt: 'desc' }],
      take: 200,
    });
    const latestByMetric = new Map<string, EnvReadingRow>();
    for (const r of readings) {
      if (!latestByMetric.has(r.metric)) {
        latestByMetric.set(r.metric, {
          metric: r.metric,
          value: r.value,
          unit: r.unit,
          district: r.district,
        });
      }
    }
    return [...latestByMetric.values()].sort((a, b) =>
      a.metric.localeCompare(b.metric),
    );
  }

  /** Simple counts used across several report headers. */
  async counts(tenantId: string): Promise<{
    assets: number;
    openAlerts: number;
    criticalAlerts: number;
    open311: number;
    activeWorkOrders: number;
    projects: number;
  }> {
    const [
      assets,
      openAlerts,
      criticalAlerts,
      open311,
      activeWorkOrders,
      projects,
    ] = await Promise.all([
      this.prisma.asset.count({ where: { tenantId } }),
      this.prisma.alert.count({ where: { tenantId, resolvedAt: null } }),
      this.prisma.alert.count({
        where: { tenantId, resolvedAt: null, severity: Severity.CRITICAL },
      }),
      this.prisma.report311.count({
        where: { tenantId, status: { notIn: ['RESOLVED', 'CLOSED'] } },
      }),
      this.prisma.workOrder.count({
        where: {
          tenantId,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
      }),
      this.prisma.capitalProject.count({ where: { tenantId } }),
    ]);
    return {
      assets,
      openAlerts,
      criticalAlerts,
      open311,
      activeWorkOrders,
      projects,
    };
  }

  /**
   * Derive a small set of priority actions from real signals (mirrors the
   * dashboard's recommendation logic, kept deterministic).
   */
  async priorityActions(tenantId: string): Promise<PriorityAction[]> {
    const [risk, counts] = await Promise.all([
      this.riskBreakdown(tenantId),
      this.counts(tenantId),
    ]);
    const actions: PriorityAction[] = [];
    if (risk.critical > 0) {
      actions.push({
        priority: 'HIGH',
        text: `Dispatch inspection crews to ${risk.critical.toLocaleString()} critical-risk assets`,
        dept: 'Public Works',
      });
    }
    if (counts.criticalAlerts > 0) {
      actions.push({
        priority: 'HIGH',
        text: `Escalate ${counts.criticalAlerts} critical alert${counts.criticalAlerts > 1 ? 's' : ''} to emergency management`,
        dept: 'City Manager',
      });
    }
    if (counts.openAlerts > counts.criticalAlerts) {
      actions.push({
        priority: 'MEDIUM',
        text: `Acknowledge and route ${counts.openAlerts} open alert${counts.openAlerts > 1 ? 's' : ''}`,
        dept: 'Operations',
      });
    }
    if (counts.open311 > 0) {
      actions.push({
        priority: 'MEDIUM',
        text: `Resolve ${counts.open311} open 311 service request${counts.open311 > 1 ? 's' : ''}`,
        dept: 'Citizen Support',
      });
    }
    if (counts.activeWorkOrders > 0) {
      actions.push({
        priority: 'LOW',
        text: `Track ${counts.activeWorkOrders} active work order${counts.activeWorkOrders > 1 ? 's' : ''} to completion`,
        dept: 'Maintenance',
      });
    }
    if (actions.length === 0) {
      actions.push({
        priority: 'LOW',
        text: 'All systems nominal — continue routine inspection schedule',
        dept: 'Operations',
      });
    }
    return actions;
  }
}

/** Map a report type to the canonical primary department (for headers). */
export function departmentForType(type: ReportType): string {
  switch (type) {
    case 'department':
      return 'Public Works';
    case 'infrastructure-condition':
      return 'Public Works';
    case 'climate':
      return 'Environment';
    case 'emergency-event':
      return 'Emergency Management';
    case 'grant':
      return 'Grant Office';
    case 'public-transparency':
      return 'Office of the City Manager';
    case 'council-briefing':
    default:
      return 'City Council';
  }
}
