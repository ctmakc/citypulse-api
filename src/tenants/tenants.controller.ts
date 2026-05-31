import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private service: TenantsService) {}

  /** GET /tenants — SUPER_ADMIN only */
  @Get()
  @ApiOperation({ summary: 'List all tenants (SUPER_ADMIN only)' })
  findAll(@Request() req: any) {
    if (req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only SUPER_ADMIN can list all tenants');
    }
    return this.service.findAll();
  }

  /** GET /tenants/:id — SUPER_ADMIN or OWNER of that tenant */
  @Get(':id')
  @ApiOperation({ summary: 'Get tenant by ID (SUPER_ADMIN or tenant OWNER)' })
  findOne(@Param('id') id: string, @Request() req: any) {
    const { role, tenantId } = req.user;
    if (role !== 'SUPER_ADMIN' && !(role === 'OWNER' && tenantId === id)) {
      throw new ForbiddenException('Access denied');
    }
    return this.service.findById(id);
  }

  /** POST /tenants — SUPER_ADMIN only */
  @Post()
  @ApiOperation({ summary: 'Create a new tenant (SUPER_ADMIN only)' })
  create(@Body() dto: CreateTenantDto, @Request() req: any) {
    if (req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only SUPER_ADMIN can create tenants');
    }
    return this.service.create(dto);
  }

  /** PATCH /tenants/:id — SUPER_ADMIN or OWNER */
  @Patch(':id')
  @ApiOperation({ summary: 'Update tenant (SUPER_ADMIN or tenant OWNER)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
    @Request() req: any,
  ) {
    const { role, tenantId } = req.user;
    if (role !== 'SUPER_ADMIN' && !(role === 'OWNER' && tenantId === id)) {
      throw new ForbiddenException('Access denied');
    }
    return this.service.update(id, dto);
  }
}
