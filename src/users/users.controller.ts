import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto, UpdateUserRoleDto } from './dto/update-user.dto';

/** Roles ordered by privilege level (lower index = more privileged) */
const ROLE_RANK: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.OWNER,
  UserRole.MAYOR,
  UserRole.COUNCIL,
  UserRole.CITY_MANAGER,
  UserRole.PUBLIC_WORKS,
  UserRole.TRANSPORTATION,
  UserRole.ENVIRONMENT,
  UserRole.UTILITIES,
  UserRole.EMERGENCY_MGMT,
  UserRole.GRANT_OFFICE,
  UserRole.CITIZEN_SUPPORT,
  UserRole.READ_ONLY,
];

function atLeast(user: any, minRole: UserRole): boolean {
  return ROLE_RANK.indexOf(user.role) <= ROLE_RANK.indexOf(minRole);
}

function requireRole(user: any, minRole: UserRole) {
  if (!atLeast(user, minRole)) {
    throw new ForbiddenException(`Requires ${minRole} or higher`);
  }
}

function requireTenantMatch(user: any, targetTenantId: string) {
  if (
    user.role !== UserRole.SUPER_ADMIN &&
    user.tenantId !== targetTenantId
  ) {
    throw new ForbiddenException('Cross-tenant access denied');
  }
}

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  /** GET /users — list users in caller's tenant (CITY_MANAGER+) */
  @Get()
  @ApiOperation({ summary: 'List users in tenant (CITY_MANAGER+)' })
  findAll(@Request() req: any) {
    requireRole(req.user, UserRole.CITY_MANAGER);
    return this.service.findAll(req.user.tenantId);
  }

  /** GET /users/:id — get user profile */
  @Get(':id')
  @ApiOperation({ summary: 'Get user by id' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    const user = await this.service.findById(id);
    requireTenantMatch(req.user, user.tenantId);
    return user;
  }

  /** POST /users — create user (OWNER only) */
  @Post()
  @ApiOperation({ summary: 'Create user (OWNER+)' })
  create(@Body() dto: CreateUserDto, @Request() req: any) {
    requireRole(req.user, UserRole.OWNER);
    return this.service.create(req.user.tenantId, dto);
  }

  /** PATCH /users/:id — update user details */
  @Patch(':id')
  @ApiOperation({ summary: 'Update user' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Request() req: any,
  ) {
    const target = await this.service.findById(id);
    requireTenantMatch(req.user, target.tenantId);
    // A user may update themselves; CITY_MANAGER+ may update others
    if (req.user.userId !== id) {
      requireRole(req.user, UserRole.CITY_MANAGER);
    }
    return this.service.update(id, dto);
  }

  /** PATCH /users/:id/role — update role (OWNER only) */
  @Patch(':id/role')
  @ApiOperation({ summary: 'Update user role (OWNER+)' })
  async updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @Request() req: any,
  ) {
    requireRole(req.user, UserRole.OWNER);
    const target = await this.service.findById(id);
    requireTenantMatch(req.user, target.tenantId);
    return this.service.updateRole(id, dto);
  }

  /** DELETE /users/:id — soft delete (OWNER only) */
  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete user (OWNER+)' })
  async remove(@Param('id') id: string, @Request() req: any) {
    requireRole(req.user, UserRole.OWNER);
    const target = await this.service.findById(id);
    requireTenantMatch(req.user, target.tenantId);
    return this.service.softDelete(id);
  }
}
