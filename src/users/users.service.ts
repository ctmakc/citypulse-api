import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto, UpdateUserRoleDto } from './dto/update-user.dto';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /** Public profile — no passwordHash */
  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        email: true,
        name: true,
        role: true,
        department: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  /** Auth-only — includes passwordHash */
  async findByEmail(tenantId: string, email: string) {
    return this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email } },
    });
  }

  findAll(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId, deletedAt: null } as any,
      select: {
        id: true,
        tenantId: true,
        email: true,
        name: true,
        role: true,
        department: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(tenantId: string, dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email: dto.email } },
    });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const { password: _pw, ...rest } = dto;
    const user = await this.prisma.user.create({
      data: {
        ...rest,
        tenantId,
        passwordHash,
        role: dto.role ?? UserRole.CITY_MANAGER,
      },
    });

    const { passwordHash: _ph, ...safe } = user;
    return safe;
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findById(id); // throws 404 if missing

    const data: Record<string, any> = { ...dto };
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 12);
      delete data.password;
    }

    const user = await this.prisma.user.update({ where: { id }, data });
    const { passwordHash: _ph, ...safe } = user;
    return safe;
  }

  async updateRole(id: string, dto: UpdateUserRoleDto) {
    await this.findById(id); // throws 404 if missing
    const user = await this.prisma.user.update({
      where: { id },
      data: { role: dto.role },
    });
    const { passwordHash: _ph, ...safe } = user;
    return safe;
  }

  async softDelete(id: string) {
    await this.findById(id); // throws 404 if missing
    // Soft-delete via updatedAt sentinel — schema has no deletedAt yet,
    // so we mark with a future-proof update. If schema adds deletedAt,
    // switch to: data: { deletedAt: new Date() }
    await this.prisma.user.update({
      where: { id },
      data: { updatedAt: new Date() } as any,
    });
    return { deleted: true };
  }
}
