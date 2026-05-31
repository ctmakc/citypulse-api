import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCapitalProjectDto } from './dto/create-capital-project.dto';
import { UpdateCapitalProjectDto } from './dto/update-capital-project.dto';

@Injectable()
export class CapitalService {
  constructor(private prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.capitalProject.findMany({
      where: { tenantId },
      orderBy: [{ deadline: 'asc' }, { probability: 'desc' }],
    });
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
