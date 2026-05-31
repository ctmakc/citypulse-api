import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AssetsService } from './assets.service.js';
import { CreateAssetDto } from './dto/create-asset.dto.js';
import { UpdateAssetDto } from './dto/update-asset.dto.js';
import { CreateInspectionDto } from './dto/create-inspection.dto.js';
import { CreateIncidentDto } from './dto/create-incident.dto.js';
import { AssetType, RiskLevel } from '@prisma/client';

@ApiTags('assets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('assets')
export class AssetsController {
  constructor(private readonly service: AssetsService) {}

  // -----------------------------------------------------------------------
  // Collection
  // -----------------------------------------------------------------------

  @Get()
  @ApiOperation({ summary: 'List all assets for the tenant with optional filters' })
  @ApiQuery({ name: 'type', required: false, enum: AssetType })
  @ApiQuery({ name: 'riskLevel', required: false, enum: RiskLevel })
  @ApiQuery({ name: 'district', required: false, type: String })
  findAll(
    @Request() req: any,
    @Query('type') type?: AssetType,
    @Query('riskLevel') riskLevel?: RiskLevel,
    @Query('district') district?: string,
  ) {
    return this.service.findAll(req.user.tenantId, { type, riskLevel, district });
  }

  @Get('map')
  @ApiOperation({ summary: 'Lightweight asset list for map rendering (id, type, name, lat, lng, condition, riskLevel)' })
  getMap(@Request() req: any) {
    return this.service.getMap(req.user.tenantId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Asset counts grouped by risk level' })
  getStats(@Request() req: any) {
    return this.service.getStats(req.user.tenantId);
  }

  // -----------------------------------------------------------------------
  // Single asset
  // -----------------------------------------------------------------------

  @Get(':id')
  @ApiOperation({ summary: 'Get a single asset with inspections, incidents, work orders, and documents' })
  @ApiParam({ name: 'id', type: String })
  findById(@Request() req: any, @Param('id') id: string) {
    return this.service.findById(req.user.tenantId, id);
  }

  @Get(':id/readings')
  @ApiOperation({
    summary:
      'Sensor time-series for an asset (~24 hourly points). Metric depends on asset type (pressure/vibration/cycle-time/health index). Deterministic given the asset.',
  })
  @ApiParam({ name: 'id', type: String })
  getReadings(@Request() req: any, @Param('id') id: string) {
    return this.service.getReadings(req.user.tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new asset' })
  @HttpCode(HttpStatus.CREATED)
  create(@Request() req: any, @Body() dto: CreateAssetDto) {
    return this.service.create(req.user.tenantId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update asset fields' })
  @ApiParam({ name: 'id', type: String })
  update(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateAssetDto) {
    return this.service.update(req.user.tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Archive (soft-delete) an asset' })
  @ApiParam({ name: 'id', type: String })
  archive(@Request() req: any, @Param('id') id: string) {
    return this.service.archive(req.user.tenantId, id);
  }

  // -----------------------------------------------------------------------
  // Sub-resources
  // -----------------------------------------------------------------------

  @Post(':id/inspections')
  @ApiOperation({ summary: 'Add an inspection record to an asset' })
  @ApiParam({ name: 'id', type: String })
  @HttpCode(HttpStatus.CREATED)
  addInspection(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CreateInspectionDto,
  ) {
    return this.service.addInspection(req.user.tenantId, id, dto);
  }

  @Post(':id/incidents')
  @ApiOperation({ summary: 'Log an incident against an asset' })
  @ApiParam({ name: 'id', type: String })
  @HttpCode(HttpStatus.CREATED)
  addIncident(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CreateIncidentDto,
  ) {
    return this.service.addIncident(req.user.tenantId, id, dto);
  }
}
