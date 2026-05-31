import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AlertsService } from './alerts.service';
import { CreateAlertDto } from './dto/create-alert.dto';
import { AlertFiltersDto } from './dto/alert-filters.dto';

@ApiTags('alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('alerts')
export class AlertsController {
  constructor(private service: AlertsService) {}

  @Get()
  @ApiOperation({ summary: 'List all alerts for the tenant' })
  findAll(@Request() req: any, @Query() filters: AlertFiltersDto) {
    return this.service.findAll(req.user.tenantId, filters);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get alert counts by severity (unresolved)' })
  getStats(@Request() req: any) {
    return this.service.getStats(req.user.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single alert by ID' })
  @ApiParam({ name: 'id', description: 'Alert UUID' })
  findById(@Request() req: any, @Param('id') id: string) {
    return this.service.findById(req.user.tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new alert (internal/agent use)' })
  create(@Request() req: any, @Body() dto: CreateAlertDto) {
    return this.service.create(req.user.tenantId, dto);
  }

  @Patch(':id/acknowledge')
  @ApiOperation({ summary: 'Acknowledge an alert' })
  @ApiParam({ name: 'id', description: 'Alert UUID' })
  acknowledge(@Request() req: any, @Param('id') id: string) {
    return this.service.acknowledge(req.user.tenantId, id);
  }

  @Patch(':id/resolve')
  @ApiOperation({ summary: 'Resolve an alert' })
  @ApiParam({ name: 'id', description: 'Alert UUID' })
  resolve(@Request() req: any, @Param('id') id: string) {
    return this.service.resolve(req.user.tenantId, id);
  }
}
