import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { WorkOrderFiltersDto } from './dto/work-order-filters.dto';
import { Priority, WorkOrderStatus } from '@prisma/client';
import {
  clampLimit,
  decodeCursor,
  cursorWhereDesc,
  buildPage,
} from '../assets/pagination.util';

@Injectable()
export class WorkOrdersService {
  constructor(private prisma: PrismaService) {}

  /**
   * List work orders for a tenant.
   *
   * Backward compatible: no `limit` => plain array (legacy, createdAt desc with
   * the asset summary included). `limit` => `{ data, nextCursor, total }`
   * envelope with stable cursor pagination (createdAt desc, id desc).
   */
  async findAll(tenantId: string, filters?: WorkOrderFiltersDto) {
    const where: Record<string, unknown> = { tenantId };

    if (filters?.status) where['status'] = filters.status;
    if (filters?.priority) where['priority'] = filters.priority;
    if (filters?.department) where['department'] = filters.department;
    if (filters?.assignee) where['assignee'] = filters.assignee;

    const include = { asset: { select: { id: true, name: true, type: true } } };

    if (filters?.limit === undefined) {
      return this.prisma.workOrder.findMany({
        where,
        include,
        orderBy: [{ createdAt: 'desc' }],
      });
    }

    const limit = clampLimit(filters.limit);
    const cursor = decodeCursor(filters.cursor);
    const [rows, total] = await Promise.all([
      this.prisma.workOrder.findMany({
        where: { ...where, ...cursorWhereDesc(cursor) },
        include,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      }),
      this.prisma.workOrder.count({ where }),
    ]);
    return buildPage(rows, limit, total);
  }

  async findById(tenantId: string, id: string) {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id, tenantId },
      include: { asset: true },
    });
    if (!wo) throw new NotFoundException(`Work order ${id} not found`);
    return wo;
  }

  create(tenantId: string, dto: CreateWorkOrderDto) {
    const { dueDate, ...rest } = dto;
    return this.prisma.workOrder.create({
      data: {
        tenantId,
        ...rest,
        ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateWorkOrderDto) {
    await this.findById(tenantId, id);
    const { dueDate, ...rest } = dto;
    return this.prisma.workOrder.update({
      where: { id },
      data: {
        ...rest,
        ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
      },
    });
  }

  async complete(tenantId: string, id: string) {
    await this.findById(tenantId, id);
    return this.prisma.workOrder.update({
      where: { id },
      data: {
        status: WorkOrderStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
  }

  async getStats(tenantId: string) {
    const [open, critical, inProgress, scheduled, backlog] = await Promise.all([
      this.prisma.workOrder.count({
        where: {
          tenantId,
          status: { notIn: [WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED] },
        },
      }),
      this.prisma.workOrder.count({
        where: {
          tenantId,
          priority: Priority.CRITICAL,
          status: { notIn: [WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED] },
        },
      }),
      this.prisma.workOrder.count({
        where: { tenantId, status: WorkOrderStatus.IN_PROGRESS },
      }),
      this.prisma.workOrder.count({
        where: { tenantId, status: WorkOrderStatus.SCHEDULED },
      }),
      this.prisma.workOrder.count({
        where: { tenantId, status: WorkOrderStatus.NEW },
      }),
    ]);

    return { open, critical, inProgress, scheduled, backlog };
  }

  async fromAlert(tenantId: string, alertId: string) {
    const alert = await this.prisma.alert.findFirst({ where: { id: alertId, tenantId } });
    if (!alert) throw new NotFoundException(`Alert ${alertId} not found`);

    return this.prisma.workOrder.create({
      data: {
        tenantId,
        title: `[Alert] ${alert.title}`,
        description: alert.description ?? undefined,
        department: alert.department ?? undefined,
        priority:
          alert.severity === 'CRITICAL'
            ? Priority.CRITICAL
            : alert.severity === 'HIGH'
              ? Priority.HIGH
              : alert.severity === 'MEDIUM'
                ? Priority.MEDIUM
                : Priority.LOW,
        source: `alert:${alertId}`,
        assetId: alert.assetId ?? undefined,
      },
    });
  }
}
