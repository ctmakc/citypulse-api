import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AgentsService {
  constructor(private prisma: PrismaService) {}

  findAll(tenantId: string) {
    return (this.prisma.agentRun as any)?.findMany({ where: { tenantId } }) ?? [];
  }
}
