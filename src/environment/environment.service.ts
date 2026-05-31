import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EnvironmentService {
  constructor(private prisma: PrismaService) {}

  findAll(tenantId: string) {
    return (this.prisma.environmentalReading as any)?.findMany({ where: { tenantId } }) ?? [];
  }
}
