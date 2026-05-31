import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportStatus, Severity, Report311 } from '@prisma/client';
import { CreateReport311Dto } from './dto/create-report311.dto';
import {
  PaginatedResult,
  clampLimit,
  decodeCursor,
  cursorWhereDesc,
  buildPage,
} from '../assets/pagination.util';

// SLA hours by severity
const SLA_HOURS: Record<Severity, number> = {
  CRITICAL: 4,
  HIGH: 24,
  MEDIUM: 72,
  LOW: 168, // 7 days
};

// Category → Department routing table
const CATEGORY_DEPARTMENT: Record<string, string> = {
  Flooding: 'Water Authority',
  'Water leak': 'Water Authority',
  Pothole: 'Public Works',
  'Road ice': 'Public Works',
  'Damaged sign': 'Public Works',
  'Streetlight out': 'Utilities',
  'Fallen tree': 'Parks',
  'Illegal dumping': 'Sanitation',
  Pollution: 'Environment',
  Noise: 'Bylaw',
};

function generateTrackingCode(): string {
  const prefix = '311';
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

function calculateSlaDeadline(severity: Severity): Date {
  const hours = SLA_HOURS[severity] ?? SLA_HOURS.LOW;
  const deadline = new Date();
  deadline.setHours(deadline.getHours() + hours);
  return deadline;
}

export interface ReportFilters {
  status?: ReportStatus;
  category?: string;
  severity?: Severity;
}

/** Pagination + filter options for the list endpoint. */
export interface ReportListOptions extends ReportFilters {
  limit?: number;
  cursor?: string;
}

export interface ReportStats {
  total: number;
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
  unrouted: number;
  avgResolutionHours: number;
}

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  category: string;
  status: ReportStatus;
  severity: Severity;
}

@Injectable()
export class Reports311Service {
  constructor(private prisma: PrismaService) {}

  /**
   * List 311 reports for a tenant.
   *
   * Backward compatible: no `limit` => plain `Report311[]` (legacy, createdAt
   * desc). `limit` => `{ data, nextCursor, total }` envelope with stable cursor
   * pagination (createdAt desc, id desc).
   */
  async findAll(
    tenantId: string,
    options?: ReportListOptions,
  ): Promise<Report311[] | PaginatedResult<Report311>> {
    const where: Record<string, unknown> = { tenantId };
    if (options?.status) where.status = options.status;
    if (options?.category) where.category = options.category;
    if (options?.severity) where.severity = options.severity;

    if (options?.limit === undefined) {
      return this.prisma.report311.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
    }

    const limit = clampLimit(options.limit);
    const cursor = decodeCursor(options.cursor);
    const [rows, total] = await Promise.all([
      this.prisma.report311.findMany({
        where: { ...where, ...cursorWhereDesc(cursor) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      }),
      this.prisma.report311.count({ where }),
    ]);
    return buildPage(rows, limit, total);
  }

  async findById(tenantId: string, id: string) {
    const report = await this.prisma.report311.findFirst({
      where: { id, tenantId },
    });
    if (!report) {
      throw new NotFoundException(`Report 311 with id '${id}' not found`);
    }
    return report;
  }

  async create(dto: CreateReport311Dto) {
    const severity = dto.severity ?? Severity.LOW;
    const trackingCode = generateTrackingCode();
    const slaDeadline = calculateSlaDeadline(severity);

    return this.prisma.report311.create({
      data: {
        tenantId: dto.tenantId,
        category: dto.category,
        severity,
        location: dto.location,
        locationLat: dto.locationLat,
        locationLng: dto.locationLng,
        description: dto.description,
        photoUrl: dto.photoUrl,
        submitterEmail: dto.submitterEmail,
        trackingCode,
        slaDeadline,
        status: ReportStatus.NEW,
      },
    });
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: ReportStatus,
    department?: string,
  ) {
    await this.findById(tenantId, id);

    const data: Record<string, unknown> = { status };
    if (department) data.department = department;
    if (status === ReportStatus.RESOLVED) data.resolvedAt = new Date();

    return this.prisma.report311.update({
      where: { id },
      data,
    });
  }

  async getDuplicates(tenantId: string, category: string, location: string) {
    // Find open reports in the same category with a similar location string
    // (case-insensitive substring match on location)
    return this.prisma.report311.findMany({
      where: {
        tenantId,
        category,
        status: {
          notIn: [ReportStatus.RESOLVED, ReportStatus.CLOSED],
        },
        location: {
          contains: location.split(' ')[0], // match on first word of address
          mode: 'insensitive',
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getStats(tenantId: string): Promise<ReportStats> {
    const reports = await this.prisma.report311.findMany({
      where: { tenantId },
      select: {
        status: true,
        severity: true,
        department: true,
        createdAt: true,
        resolvedAt: true,
      },
    });

    const byStatus: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    let unrouted = 0;
    let resolutionHoursSum = 0;
    let resolvedCount = 0;

    for (const r of reports) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1;

      if (!r.department) unrouted++;

      if (r.resolvedAt) {
        const diffMs = r.resolvedAt.getTime() - r.createdAt.getTime();
        resolutionHoursSum += diffMs / (1000 * 60 * 60);
        resolvedCount++;
      }
    }

    return {
      total: reports.length,
      byStatus,
      bySeverity,
      unrouted,
      avgResolutionHours:
        resolvedCount > 0
          ? Math.round((resolutionHoursSum / resolvedCount) * 10) / 10
          : 0,
    };
  }

  async route(tenantId: string, id: string) {
    const report = await this.findById(tenantId, id);
    const department =
      CATEGORY_DEPARTMENT[report.category] ?? 'General Services';

    return this.prisma.report311.update({
      where: { id },
      data: {
        department,
        status: ReportStatus.ASSIGNED,
      },
    });
  }

  async getMapPoints(tenantId: string): Promise<MapPoint[]> {
    const reports = await this.prisma.report311.findMany({
      where: {
        tenantId,
        locationLat: { not: null },
        locationLng: { not: null },
      },
      select: {
        id: true,
        locationLat: true,
        locationLng: true,
        category: true,
        status: true,
        severity: true,
      },
    });

    return reports
      .filter((r) => r.locationLat !== null && r.locationLng !== null)
      .map((r) => ({
        id: r.id,
        lat: r.locationLat as number,
        lng: r.locationLng as number,
        category: r.category,
        status: r.status,
        severity: r.severity,
      }));
  }
}
