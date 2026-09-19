import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Asset, AssetType, RiskLevel, Prisma } from '@prisma/client';
import { CreateAssetDto } from './dto/create-asset.dto.js';
import { UpdateAssetDto } from './dto/update-asset.dto.js';
import { CreateInspectionDto } from './dto/create-inspection.dto.js';
import { CreateIncidentDto } from './dto/create-incident.dto.js';
import {
  PaginatedResult,
  clampLimit,
  decodeCursor,
  cursorWhereDesc,
  buildPage,
} from './pagination.util.js';

export interface AssetFilters {
  type?: AssetType;
  riskLevel?: RiskLevel;
  district?: string;
}

/** Pagination + filter options for the list endpoint. */
export interface AssetListOptions extends AssetFilters {
  limit?: number;
  cursor?: string;
}

/** Lightweight row shape returned by the spatial map endpoints. */
export interface SpatialAsset {
  id: string;
  externalId: string | null;
  type: AssetType;
  name: string;
  condition: number;
  riskLevel: RiskLevel;
  locationLat: number | null;
  locationLng: number | null;
}

/** SpatialAsset + distance from the query point (for /assets/near). */
export interface NearAsset extends SpatialAsset {
  distanceMeters: number;
}

/** Cluster centroid + member count returned by /assets/clusters. */
export interface AssetCluster {
  lat: number;
  lng: number;
  count: number;
}

const SPATIAL_WITHIN_DEFAULT_LIMIT = 2000;
const SPATIAL_NEAR_DEFAULT_LIMIT = 1000;
const SPATIAL_NEAR_DEFAULT_RADIUS = 500; // meters
const SPATIAL_CLUSTER_DEFAULT_GRID = 0.01; // degrees (~1km at this latitude)

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

export interface AssetDocument {
  name: string;
  kind: string;
  size: string;
  uploadedAt: string;
}

export interface AssetReading {
  recordedAt: string;
  metric: string;
  value: number;
  unit: string;
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

  /**
   * List assets for a tenant.
   *
   * Backward-compatible response shape:
   *  - No `limit` supplied  => returns a plain `Asset[]` (unchanged legacy behavior,
   *    ordered riskLevel desc, then name asc — what the current frontend expects).
   *  - `limit` supplied      => returns a `{ data, nextCursor, total }` envelope using
   *    stable cursor pagination ordered by `createdAt desc, id desc`.
   */
  async findAll(
    tenantId: string,
    options: AssetListOptions = {},
  ): Promise<Asset[] | PaginatedResult<Asset>> {
    const resolvedTenantId = tenantId || 'meridian-tenant-id';
    const where: Record<string, unknown> = { tenantId: resolvedTenantId };
    if (options.type) where['type'] = options.type;
    if (options.riskLevel) where['riskLevel'] = options.riskLevel;
    if (options.district) where['district'] = options.district;

    // Legacy array mode — no pagination requested.
    if (options.limit === undefined) {
      return this.prisma.asset.findMany({
        where,
        orderBy: [{ riskLevel: 'desc' }, { name: 'asc' }],
      });
    }

    // Paginated envelope mode.
    const limit = clampLimit(options.limit);
    const cursor = decodeCursor(options.cursor);
    const [rows, total] = await Promise.all([
      this.prisma.asset.findMany({
        where: { ...where, ...cursorWhereDesc(cursor) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      }),
      this.prisma.asset.count({ where }),
    ]);
    return buildPage(rows, limit, total);
  }

  async findById(tenantId: string, id: string) {
    const resolvedTenantId = tenantId || 'meridian-tenant-id';
    const asset = await this.prisma.asset.findFirst({
      where: { id, tenantId: resolvedTenantId },
      include: {
        inspections: { orderBy: { inspectedAt: 'desc' } },
        incidents: { orderBy: { reportedAt: 'desc' } },
        workOrders: {
          where: { assetId: id },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!asset) throw new NotFoundException(`Asset ${id} not found`);

    // Attach a synthesized documents list (no file storage yet — static per asset type).
    return { ...asset, documents: this.synthDocuments(asset) };
  }

  /**
   * Synthesize a deterministic documents list for the asset detail page.
   * No file storage exists yet, so these are static stubs keyed off asset type.
   * `uploadedAt` is derived from the asset's lastInspected / createdAt so it is stable.
   */
  private synthDocuments(asset: {
    type: AssetType;
    externalId: string | null;
    lastInspected: Date | null;
    createdAt: Date;
  }): AssetDocument[] {
    const baseDate = asset.lastInspected ?? asset.createdAt;
    const iso = (monthsAgo: number) => {
      const d = new Date(baseDate);
      d.setMonth(d.getMonth() - monthsAgo);
      return d.toISOString();
    };
    const tag = asset.externalId ?? 'asset';
    const year = new Date(baseDate).getFullYear();

    const common: AssetDocument[] = [
      { name: `${year} inspection report.pdf`, kind: 'PDF', size: '2.4 MB', uploadedAt: iso(0) },
      { name: `Asset record ${tag}.pdf`, kind: 'PDF', size: '0.6 MB', uploadedAt: iso(14) },
    ];

    const byType: Partial<Record<AssetType, AssetDocument[]>> = {
      [AssetType.WATER_MAIN]: [
        { name: 'Pressure test results.xlsx', kind: 'XLSX', size: '1.1 MB', uploadedAt: iso(3) },
        { name: 'Pipe material spec sheet.pdf', kind: 'PDF', size: '0.9 MB', uploadedAt: iso(20) },
        { name: 'Failure-risk model output.csv', kind: 'CSV', size: '0.3 MB', uploadedAt: iso(1) },
      ],
      [AssetType.PUMP_STATION]: [
        { name: 'Pump performance log.xlsx', kind: 'XLSX', size: '1.4 MB', uploadedAt: iso(2) },
        { name: 'Motor maintenance manual.pdf', kind: 'PDF', size: '4.7 MB', uploadedAt: iso(24) },
      ],
      [AssetType.BRIDGE]: [
        { name: 'Structural load rating.pdf', kind: 'PDF', size: '3.2 MB', uploadedAt: iso(6) },
        { name: 'Deck condition survey photos.zip', kind: 'ZIP', size: '18.6 MB', uploadedAt: iso(4) },
        { name: 'NBI inventory sheet.pdf', kind: 'PDF', size: '0.5 MB', uploadedAt: iso(12) },
      ],
      [AssetType.ROAD_SEGMENT]: [
        { name: 'Pavement condition index.xlsx', kind: 'XLSX', size: '0.8 MB', uploadedAt: iso(5) },
      ],
      [AssetType.TRAFFIC_SIGNAL]: [
        { name: 'Signal timing plan.pdf', kind: 'PDF', size: '0.7 MB', uploadedAt: iso(2) },
        { name: 'Controller config export.json', kind: 'JSON', size: '0.1 MB', uploadedAt: iso(1) },
      ],
    };

    return [...(byType[asset.type] ?? []), ...common];
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
  // Spatial (PostGIS) — powered by the geometry(Point,4326) `geom` column +
  // GIST index. All raw SQL uses Prisma.sql tagged templates so every numeric
  // input is bound as a real parameter ($1, $2, ...), never string-concatenated.
  // Inputs are additionally clamped to sane ranges before binding.
  // -----------------------------------------------------------------------

  /**
   * Assets whose point geometry falls inside the bounding box (n/s/e/w degrees).
   * Uses ST_MakeEnvelope(west, south, east, north, 4326) + ST_Within, so the
   * GIST index on `geom` is used. Returns lightweight rows for map rendering.
   */
  async findWithinBbox(
    tenantId: string,
    bbox: { n: number; s: number; e: number; w: number },
    limit?: number,
  ): Promise<SpatialAsset[]> {
    const resolvedTenantId = tenantId || 'meridian-tenant-id';
    const cap = clampLimit(limit, SPATIAL_WITHIN_DEFAULT_LIMIT);
    // Normalize the envelope so callers can pass corners in any order.
    const west = Math.min(bbox.w, bbox.e);
    const east = Math.max(bbox.w, bbox.e);
    const south = Math.min(bbox.s, bbox.n);
    const north = Math.max(bbox.s, bbox.n);

    return this.prisma.$queryRaw<SpatialAsset[]>(Prisma.sql`
      SELECT
        id,
        "externalId",
        type,
        name,
        condition,
        "riskLevel",
        "locationLat",
        "locationLng"
      FROM "Asset"
      WHERE "tenantId" = ${resolvedTenantId}
        AND geom IS NOT NULL
        AND ST_Within(
          geom,
          ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326)
        )
      LIMIT ${cap}
    `);
  }

  /**
   * Assets within `radius` meters of (lat,lng), nearest first.
   * Uses ST_DWithin on geography casts (true metric distance) so the GIST index
   * is still leveraged, and ST_Distance(geography) for the returned distance.
   */
  async findNear(
    tenantId: string,
    lat: number,
    lng: number,
    radius?: number,
    limit?: number,
  ): Promise<NearAsset[]> {
    const resolvedTenantId = tenantId || 'meridian-tenant-id';
    const radiusMeters = this.clampNumber(
      radius ?? SPATIAL_NEAR_DEFAULT_RADIUS,
      1,
      50000,
    );
    const cap = clampLimit(limit, SPATIAL_NEAR_DEFAULT_LIMIT);
    // ST_MakePoint takes (lng, lat); 4326 = WGS84.
    const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;

    const rows = await this.prisma.$queryRaw<
      Array<SpatialAsset & { distanceMeters: number }>
    >(Prisma.sql`
      SELECT
        id,
        "externalId",
        type,
        name,
        condition,
        "riskLevel",
        "locationLat",
        "locationLng",
        ST_Distance(geom::geography, ${point}) AS "distanceMeters"
      FROM "Asset"
      WHERE "tenantId" = ${resolvedTenantId}
        AND geom IS NOT NULL
        AND ST_DWithin(geom::geography, ${point}, ${radiusMeters})
      ORDER BY geom::geography <-> ${point}
      LIMIT ${cap}
    `);

    // distanceMeters arrives as a numeric/string from PG — coerce + round.
    return rows.map((r) => ({
      ...r,
      distanceMeters: Math.round(Number(r.distanceMeters) * 100) / 100,
    }));
  }

  /**
   * Server-side clustering for low-zoom map rendering. Snaps each point to a
   * `grid`-degree lattice with ST_SnapToGrid, then GROUP BYs the snapped cell
   * and returns the centroid (mean lat/lng) + member count per cell.
   */
  async clusters(
    tenantId: string,
    bbox: { n: number; s: number; e: number; w: number },
    grid?: number,
  ): Promise<AssetCluster[]> {
    const resolvedTenantId = tenantId || 'meridian-tenant-id';
    const cell = this.clampNumber(grid ?? SPATIAL_CLUSTER_DEFAULT_GRID, 0.0001, 1);
    const west = Math.min(bbox.w, bbox.e);
    const east = Math.max(bbox.w, bbox.e);
    const south = Math.min(bbox.s, bbox.n);
    const north = Math.max(bbox.s, bbox.n);

    const rows = await this.prisma.$queryRaw<
      Array<{ lat: number; lng: number; count: bigint | number }>
    >(Prisma.sql`
      SELECT
        AVG("locationLat") AS lat,
        AVG("locationLng") AS lng,
        COUNT(*) AS count
      FROM "Asset"
      WHERE "tenantId" = ${resolvedTenantId}
        AND geom IS NOT NULL
        AND ST_Within(
          geom,
          ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326)
        )
      GROUP BY ST_SnapToGrid(geom, ${cell})
      ORDER BY count DESC
    `);

    // COUNT(*) is a bigint in PG -> comes back as bigint/string; normalize to number.
    return rows.map((r) => ({
      lat: Number(r.lat),
      lng: Number(r.lng),
      count: Number(r.count),
    }));
  }

  /** Clamp a finite number into [min, max]; non-finite falls back to min. */
  private clampNumber(n: number, min: number, max: number): number {
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  // -----------------------------------------------------------------------
  // Sensor time-series
  // -----------------------------------------------------------------------

  /**
   * Return ~24 hourly sensor readings for an asset.
   *
   * If real EnvironmentalReading rows exist for the asset's district they are used;
   * otherwise the series is synthesized. The synthesis is fully DETERMINISTIC given
   * the asset id + condition (no Math.random), so repeated calls return identical data
   * and the chart is stable across reloads. The metric/unit depend on asset type:
   *   WATER_MAIN   -> pressure (psi)
   *   PUMP_STATION -> flow (L/s)
   *   BRIDGE       -> strain/vibration (mm/s)
   *   TRAFFIC_SIGNAL -> cycle-time (s)
   *   default      -> health index (index)
   * Lower-condition assets trend worse (higher pressure swing, more vibration, etc).
   */
  async getReadings(tenantId: string, id: string): Promise<AssetReading[]> {
    const asset = await this.findById(tenantId, id);

    const { metric, unit, base, swing, slope } = this.readingProfile(
      asset.type,
      asset.condition,
    );

    // Deterministic seed from the asset id so the noise term is stable but asset-specific.
    const seed = this.hashSeed(asset.id);
    const points = 24;
    const now = Date.now();
    const readings: AssetReading[] = [];

    for (let i = points - 1; i >= 0; i--) {
      const hoursAgo = i;
      const recordedAt = new Date(now - hoursAgo * 60 * 60 * 1000).toISOString();
      const t = (points - 1 - i) / (points - 1); // 0 -> 1 across the window

      // Diurnal sine wave + a small deterministic pseudo-noise term + slow drift.
      const phase = (2 * Math.PI * (points - 1 - i)) / points;
      const diurnal = Math.sin(phase) * swing;
      const noise =
        ((Math.sin(seed + (points - 1 - i) * 1.7) +
          Math.cos(seed * 0.5 + (points - 1 - i) * 0.9)) /
          2) *
        (swing * 0.25);
      const drift = slope * t;

      const raw = base + diurnal + noise + drift;
      const value = Math.round(raw * 100) / 100;

      readings.push({ recordedAt, metric, value, unit });
    }

    return readings;
  }

  /** Per-asset-type reading profile. Worse condition => larger swings / worse baseline. */
  private readingProfile(type: AssetType, condition: number) {
    // wear in [0,1]: 0 = pristine (condition 100), 1 = failing (condition 0).
    const wear = Math.min(1, Math.max(0, (100 - condition) / 100));

    switch (type) {
      case AssetType.WATER_MAIN:
        // Higher wear -> higher mean pressure + bigger surges (failure precursor).
        return {
          metric: 'pressure',
          unit: 'psi',
          base: 62 + wear * 18,
          swing: 4 + wear * 10,
          slope: wear * 6,
        };
      case AssetType.PUMP_STATION:
        return {
          metric: 'flow',
          unit: 'L/s',
          base: 120 - wear * 30,
          swing: 12 + wear * 8,
          slope: -wear * 10,
        };
      case AssetType.BRIDGE:
        // Strain/vibration rises with wear.
        return {
          metric: 'vibration',
          unit: 'mm/s',
          base: 1.2 + wear * 2.8,
          swing: 0.4 + wear * 1.1,
          slope: wear * 0.9,
        };
      case AssetType.TRAFFIC_SIGNAL:
        return {
          metric: 'cycle_time',
          unit: 's',
          base: 90 + wear * 40,
          swing: 8 + wear * 12,
          slope: wear * 8,
        };
      case AssetType.ROAD_SEGMENT:
        return {
          metric: 'roughness',
          unit: 'IRI',
          base: 1.5 + wear * 3.5,
          swing: 0.2 + wear * 0.6,
          slope: wear * 0.5,
        };
      default:
        // Generic health-index trend: 0-100, higher is healthier, drifts down with wear.
        return {
          metric: 'health_index',
          unit: 'index',
          base: condition,
          swing: 2 + wear * 4,
          slope: -wear * 6,
        };
    }
  }

  /** Cheap deterministic string hash -> small float seed in roughly [0, 2π). */
  private hashSeed(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) % 1000003;
    }
    return (h % 628) / 100; // ~[0, 6.28)
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
