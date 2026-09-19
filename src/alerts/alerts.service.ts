import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAlertDto } from './dto/create-alert.dto';
import { AlertFiltersDto } from './dto/alert-filters.dto';
import { Severity, Alert } from '@prisma/client';
import {
  clampLimit,
  decodeCursor,
  cursorWhereDesc,
  buildPage,
} from '../assets/pagination.util';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * List alerts for a tenant.
   *
   * Backward compatible: no `limit` => plain array (legacy, createdAt desc).
   * `limit` => `{ data, nextCursor, total }` envelope with stable cursor
   * pagination (createdAt desc, id desc).
   */
  async findAll(tenantId: string, filters?: AlertFiltersDto) {
    const where: Record<string, unknown> = { tenantId };

    if (filters?.severity) where['severity'] = filters.severity;
    if (filters?.category) where['category'] = filters.category;
    if (filters?.department) where['department'] = filters.department;
    if (filters?.acknowledged !== undefined) where['acknowledged'] = filters.acknowledged;
    if (filters?.unresolved) where['resolvedAt'] = null;

    if (filters?.limit === undefined) {
      return this.prisma.alert.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
      });
    }

    const limit = clampLimit(filters.limit);
    const cursor = decodeCursor(filters.cursor);
    const [rows, total] = await Promise.all([
      this.prisma.alert.findMany({
        where: { ...where, ...cursorWhereDesc(cursor) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      }),
      this.prisma.alert.count({ where }),
    ]);
    return buildPage(rows, limit, total);
  }

  async findById(tenantId: string, id: string) {
    const alert = await this.prisma.alert.findFirst({ where: { id, tenantId } });
    if (!alert) throw new NotFoundException(`Alert ${id} not found`);
    return alert;
  }

  async create(tenantId: string, dto: CreateAlertDto) {
    const alert = await this.prisma.alert.create({
      data: { tenantId, ...dto },
    });

    // A newly-created Critical alert fans out to email + webhook. This is
    // fire-and-forget: notification delivery must never block or fail the
    // alert write, so we don't await it and we swallow any error.
    if (alert.severity === Severity.CRITICAL) {
      this.notifyCritical(alert);
    }

    return alert;
  }

  /**
   * Best-effort notification fan-out for a Critical alert. Fully decoupled from
   * the request: the NotificationsService methods already swallow their own
   * errors, and this wrapper adds a final catch so an unexpected throw can't
   * surface as an unhandled rejection.
   */
  private notifyCritical(alert: Alert): void {
    const subject = `[CityPulse] CRITICAL: ${alert.title}`;
    const lines = [
      `A critical alert was raised in CityPulse.`,
      ``,
      `Title:       ${alert.title}`,
      `Category:    ${alert.category}`,
      alert.description ? `Description: ${alert.description}` : undefined,
      alert.location ? `Location:    ${alert.location}` : undefined,
      alert.department ? `Department:  ${alert.department}` : undefined,
      alert.assetId ? `Asset:       ${alert.assetId}` : undefined,
      `Raised at:   ${alert.createdAt.toISOString()}`,
      `Alert ID:    ${alert.id}`,
    ].filter((l): l is string => l !== undefined);
    const body = lines.join('\n');

    const recipient = process.env.ALERT_EMAIL_TO || 'ops@citypulse.local';
    const webhookPayload = {
      type: 'alert.critical',
      tenantId: alert.tenantId,
      alertId: alert.id,
      severity: alert.severity,
      category: alert.category,
      title: alert.title,
      description: alert.description ?? null,
      location: alert.location ?? null,
      department: alert.department ?? null,
      assetId: alert.assetId ?? null,
      createdAt: alert.createdAt.toISOString(),
    };

    void Promise.allSettled([
      this.notifications.sendEmail(recipient, subject, body),
      this.notifications.sendWebhook(webhookPayload),
    ]).catch((err) => {
      this.logger.warn(
        `Critical-alert notification fan-out failed for ${alert.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
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
