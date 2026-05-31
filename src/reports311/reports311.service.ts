import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class Reports311Service {
  constructor(private prisma: PrismaService) {}

  findAll(tenantId: string) {
    return (this.prisma.report311 as any)?.findMany({ where: { tenantId } }) ?? [];
  }
}
