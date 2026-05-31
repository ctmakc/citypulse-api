import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Asset, AssetType, RiskLevel } from '@prisma/client';
import { CreateAssetDto } from './dto/create-asset.dto.js';
import { UpdateAssetDto } from './dto/update-asset.dto.js';
import { CreateInspectionDto } from './dto/create-inspection.dto.js';
import { CreateIncidentDto } from './dto/create-incident.dto.js';

export interface AssetFilters {
  type?: AssetType;
  riskLevel?: RiskLevel;
  district?: string;
}

export interface AssetStats {
  total: number;
  critical: number;
  elevated: number;
  watch: number;
  ok: number;
}

export interface MapAsset {
  id: string;
  type: AssetType;
  name: string;
  locationLat: number | null;
  locationLng: number | null;
  condition: number;
  riskLevel: RiskLevel;
}

/** Derive a RiskLevel from condition score and failure probability. */
function calcRiskLevel(condition: number, failureProb: number): RiskLevel {
  const score = (100 - condition) * 0.6 + failureProb * 100 * 0.4;
  if (score >= 75) return RiskLevel.CRITICAL;
  if (score >= 50) return RiskLevel.ELEVATED;
  if (score >= 25) return RiskLevel.WATCH;
  return RiskLevel.OK;
}

@Injectable()
export class AssetsService {
  constructor(private prisma: PrismaService) {}

  // -----------------------------------------------------------------------
  // List / find
  // -----------------------------------------------------------------------

  async findAll(tenantId: string, filters: AssetFilters = {}): Promise<Asset[]> {
    const resolvedTenantId = tenantId || 'meridian-tenant-id';
    const where: Record<string, unknown> = { tenantId: resolvedTenantId };
    if (filters.type) where['type'] = filters.type;
    if (filters.riskLevel) where['riskLevel'] = filters.riskLevel;
    if (filters.district) where['district'] = filters.district;

    return this.prisma.asset.findMany({
      where,
      orderBy: [{ riskLevel: 'desc' }, { name: 'asc' }],
    });
  }

  async findById(tenantId: string, id: string) {
    const resolvedTenantId = tenantId || 'meridian-tenant-id';
    const asset = await this.prisma.asset.findFirst({
      where: { id, tenantId: resolvedTenantId },
      include: {
        inspections: { orderBy: { inspectedAt: 'desc' } },
        incidents: { orderBy: { reportedAt: 'desc' } },
        workOrders: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!asset) throw new NotFoundException(`Asset ${id} not found`);
    return asset;
  }

  // -----------------------------------------------------------------------
  // Map / stats
  // -----------------------------------------------------------------------

  async getMap(tenantId: string): Promise<MapAsset[]> {
    const resolvedTenantId = tenantId || 'meridian-tenant-id';
    const assets = await this.prisma.asset.findMany({
      where: { tenantId: resolvedTenantId },
      select: {
        id: true,
        type: true,
        name: true,
        locationLat: true,
        locationLng: true,
        condition: true,
        riskLevel: true,
      },
    });
    return assets;
  }

  async getStats(tenantId: string): Promise<AssetStats> {
    const resolvedTenantId = tenantId || 'meridian-tenant-id';
    const [total, critical, elevated, watch, ok] = await Promise.all([
      this.prisma.asset.count({ where: { tenantId: resolvedTenantId } }),
      this.prisma.asset.count({ where: { tenantId: resolvedTenantId, riskLevel: RiskLevel.CRITICAL } }),
      this.prisma.asset.count({ where: { tenantId: resolvedTenantId, riskLevel: RiskLevel.ELEVATED } }),
      this.prisma.asset.count({ where: { tenantId: resolvedTenantId, riskLevel: RiskLevel.WATCH } }),
      this.prisma.asset.count({ where: { tenantId: resolvedTenantId, riskLevel: RiskLevel.OK } }),
    ]);
    return { total, critical, elevated, watch, ok };
  }

  // -----------------------------------------------------------------------
  // Mutations
  // -----------------------------------------------------------------------

  async create(tenantId: string, dto: CreateAssetDto): Promise<Asset> {
    const condition = dto.condition ?? 100;
    const failureProb = dto.failureProb ?? 0;
    const riskLevel = calcRiskLevel(condition, failureProb);

    return this.prisma.asset.create({
      data: {
        tenantId,
        type: dto.type,
        name: dto.name,
        description: dto.description,
        externalId: dto.externalId,
        locationLat: dto.locationLat,
        locationLng: dto.locationLng,
        district: dto.district,
        department: dto.department,
        condition,
        failureProb,
        riskLevel,
        installedAt: dto.installedAt ? new Date(dto.installedAt) : undefined,
        nextInspection: dto.nextInspection ? new Date(dto.nextInspection) : undefined,
        replacementCost: dto.replacementCost,
        maintenanceCost: dto.maintenanceCost,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateAssetDto): Promise<Asset> {
    await this.findById(tenantId, id);

    const data: Record<string, unknown> = { ...dto };

    // Re-derive riskLevel if condition or failureProb changed
    if (dto.condition !== undefined || dto.failureProb !== undefined) {
      const current = await this.prisma.asset.findUniqueOrThrow({ where: { id } });
      const condition = dto.condition ?? current.condition;
      const failureProb = dto.failureProb ?? current.failureProb;
      data['riskLevel'] = calcRiskLevel(condition, failureProb);
    }

    // Coerce date strings
    if (dto.installedAt) data['installedAt'] = new Date(dto.installedAt);
    if (dto.nextInspection) data['nextInspection'] = new Date(dto.nextInspection);

    return this.prisma.asset.update({ where: { id }, data });
  }

  async updateRisk(tenantId: string, id: string): Promise<Asset> {
    const asset = await this.findById(tenantId, id);
    const riskLevel = calcRiskLevel(asset.condition, asset.failureProb);
    return this.prisma.asset.update({ where: { id }, data: { riskLevel } });
  }

  /** Soft-delete: mark archived via a description tag — no Prisma deletedAt field in schema,
   *  so we store an archived flag in description prefix and set condition=0 as tombstone. */
  async archive(tenantId: string, id: string): Promise<Asset> {
    await this.findById(tenantId, id);
    return this.prisma.asset.update({
      where: { id },
      data: {
        riskLevel: RiskLevel.OK,
        description: `[ARCHIVED] `,
      },
    });
  }

  // -----------------------------------------------------------------------
  // Sub-resources
  // -----------------------------------------------------------------------

  async addInspection(tenantId: string, assetId: string, dto: CreateInspectionDto) {
    await this.findById(tenantId, assetId);

    const inspection = await this.prisma.inspection.create({
      data: {
        assetId,
        tenantId,
        inspector: dto.inspector,
        condition: dto.condition,
        notes: dto.notes,
        findings: (dto.findings as any) ?? undefined,
      },
    });

    // Update asset condition and last-inspected from the latest inspection
    const riskLevel = calcRiskLevel(dto.condition, 0);
    await this.prisma.asset.update({
      where: { id: assetId },
      data: {
        condition: dto.condition,
        riskLevel,
        lastInspected: inspection.inspectedAt,
      },
    });

    return inspection;
  }

  async addIncident(tenantId: string, assetId: string, dto: CreateIncidentDto) {
    await this.findById(tenantId, assetId);

    return this.prisma.incident.create({
      data: {
        assetId,
        tenantId,
        title: dto.title,
        description: dto.description,
        severity: dto.severity,
      },
    });
  }
}
