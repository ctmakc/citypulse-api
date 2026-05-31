import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TrafficService {
  constructor(private prisma: PrismaService) {}

  findAll(tenantId: string) {
    return (this.prisma.trafficReading as any)?.findMany({ where: { tenantId } }) ?? [];
  }
}
