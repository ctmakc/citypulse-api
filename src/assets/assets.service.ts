import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AssetsService {
  constructor(private prisma: PrismaService) {}

  findAll(tenantId: string) {
    return (this.prisma.asset as any)?.findMany({ where: { tenantId } }) ?? [];
  }
}
