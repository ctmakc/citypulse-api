import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Reports311Service } from './reports311.service';
import { CreateReport311Dto } from './dto/create-report311.dto';
import { UpdateReport311StatusDto } from './dto/update-report311-status.dto';
import { ListReports311Dto } from './dto/list-reports311.dto';

@ApiTags('reports311')
@Controller('reports311')
export class Reports311Controller {
  constructor(private service: Reports311Service) {}

  // ─── Authenticated routes ────────────────────────────────────────────────

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'List 311 reports for the tenant',
    description:
      'Backward compatible: no `limit` => plain array (legacy); `limit` => ' +
      'paginated envelope { data, nextCursor, total }.',
  })
  findAll(@Request() req: any, @Query() query: ListReports311Dto) {
    return this.service.findAll(req.user.tenantId, query);
  }

  @Get('stats')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get 311 report statistics for the tenant' })
  getStats(@Request() req: any) {
    return this.service.getStats(req.user.tenantId);
  }

  @Get('map')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get lat/lng points for map rendering' })
  getMap(@Request() req: any) {
    return this.service.getMapPoints(req.user.tenantId);
  }

  // Public citizen tracking lookup. Declared BEFORE `:id` so the literal
  // `track` segment is matched before the `:id` wildcard. No auth: the
  // trackingCode itself is the secret. Returns safe fields only.
  @Get('track/:code')
  @ApiOperation({
    summary: 'Track a 311 report by its tracking code (public — no auth)',
    description:
      'Returns non-sensitive status info for a citizen-facing tracking page. ' +
      'Looks up by trackingCode (the code is the secret; not tenant-scoped).',
  })
  @ApiParam({ name: 'code', description: 'Report tracking code' })
  track(@Param('code') code: string) {
    return this.service.trackByCode(code);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get a single 311 report by ID' })
  @ApiParam({ name: 'id', description: 'Report UUID' })
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.service.findById(req.user.tenantId, id);
  }

  // ─── Public route (tenant-scoped via query param) ────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit a 311 report (public — no auth required)',
    description:
      'tenantId must be supplied in the request body. ' +
      'Automatically generates a trackingCode and calculates slaDeadline.',
  })
  create(@Body() dto: CreateReport311Dto) {
    return this.service.create(dto);
  }

  // ─── Staff routes (CITIZEN_SUPPORT+) ────────────────────────────────────

  @Patch(':id/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.CITIZEN_SUPPORT,
    UserRole.PUBLIC_WORKS,
    UserRole.CITY_MANAGER,
    UserRole.MAYOR,
    UserRole.OWNER,
    UserRole.SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Update the status of a 311 report' })
  @ApiParam({ name: 'id', description: 'Report UUID' })
  updateStatus(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateReport311StatusDto,
  ) {
    return this.service.updateStatus(
      req.user.tenantId,
      id,
      dto.status,
      dto.department,
    );
  }

  @Post(':id/route')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.CITIZEN_SUPPORT,
    UserRole.PUBLIC_WORKS,
    UserRole.CITY_MANAGER,
    UserRole.MAYOR,
    UserRole.OWNER,
    UserRole.SUPER_ADMIN,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Auto-route a report to the correct department based on its category',
  })
  @ApiParam({ name: 'id', description: 'Report UUID' })
  route(@Request() req: any, @Param('id') id: string) {
    return this.service.route(req.user.tenantId, id);
  }
}
