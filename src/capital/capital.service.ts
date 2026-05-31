import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCapitalProjectDto } from './dto/create-capital-project.dto';
import { UpdateCapitalProjectDto } from './dto/update-capital-project.dto';
import { ListCapitalDto } from './dto/list-capital.dto';
import {
  clampLimit,
  decodeCursor,
  cursorWhereDesc,
  buildPage,
} from '../assets/pagination.util';

@Injectable()
export class CapitalService {
  constructor(private prisma: PrismaService) {}

  /**
   * List capital projects for a tenant.
   *
   * Backward compatible: no `limit` => plain array (legacy ordering: deadline
   * asc, probability desc). `limit` => `{ data, nextCursor, total }` envelope
   * with stable cursor pagination (createdAt desc, id desc).
   */
  async findAll(tenantId: string, options?: ListCapitalDto) {
    const where: Record<string, unknown> = { tenantId };
    if (options?.status) where['status'] = options.status;
    if (options?.urgency) where['urgency'] = options.urgency;

    if (options?.limit === undefined) {
      return this.prisma.capitalProject.findMany({
        where,
        orderBy: [{ deadline: 'asc' }, { probability: 'desc' }],
      });
    }

    const limit = clampLimit(options.limit);
    const cursor = decodeCursor(options.cursor);
    const [rows, total] = await Promise.all([
      this.prisma.capitalProject.findMany({
        where: { ...where, ...cursorWhereDesc(cursor) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      }),
      this.prisma.capitalProject.count({ where }),
    ]);
    return buildPage(rows, limit, total);
  }

  async findById(tenantId: string, id: string) {
    const project = await this.prisma.capitalProject.findFirst({ where: { id, tenantId } });
    if (!project) throw new NotFoundException(`Capital project ${id} not found`);
    return project;
  }

  create(tenantId: string, dto: CreateCapitalProjectDto) {
    const { deadline, ...rest } = dto;
    return this.prisma.capitalProject.create({
      data: {
        tenantId,
        ...rest,
        ...(deadline ? { deadline: new Date(deadline) } : {}),
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateCapitalProjectDto) {
    await this.findById(tenantId, id);
    const { deadline, ...rest } = dto;
    return this.prisma.capitalProject.update({
      where: { id },
      data: {
        ...rest,
        ...(deadline ? { deadline: new Date(deadline) } : {}),
      },
    });
  }

  async getStats(tenantId: string) {
    const projects = await this.prisma.capitalProject.findMany({
      where: { tenantId },
      select: { cost: true, deadline: true, probability: true, grantEligibility: true },
    });

    const eligible = projects.filter(
      (p) =>
        p.grantEligibility &&
        !['ineligible', 'not eligible', 'n/a'].includes(p.grantEligibility.toLowerCase()),
    ).length;

    const totalPipeline = projects.reduce((sum, p) => sum + (p.cost ?? 0), 0);

    const now = new Date();
    const upcoming = projects
      .filter((p) => p.deadline && p.deadline > now)
      .sort((a, b) => (a.deadline as Date).getTime() - (b.deadline as Date).getTime());

    const nearestDeadline = upcoming.length > 0 ? upcoming[0].deadline : null;

    const topProbability =
      projects.length > 0
        ? Math.max(...projects.map((p) => p.probability ?? 0))
        : 0;

    return {
      eligible,
      totalPipeline,
      nearestDeadline,
      topProbability,
    };
  }
}
