import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkOrdersService {
  constructor(private prisma: PrismaService) {}

  findAll(tenantId: string) {
    return (this.prisma as any)['workOrder']?.findMany({ where: { tenantId } }) ?? [];
  }
}
