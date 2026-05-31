import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findAll(tenantId: string) {
    return (this.prisma.user as any)?.findMany({ where: { tenantId } }) ?? [];
  }
}
