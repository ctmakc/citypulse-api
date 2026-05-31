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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkOrdersService } from './work-orders.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { WorkOrderFiltersDto } from './dto/work-order-filters.dto';

@ApiTags('work-orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('work-orders')
export class WorkOrdersController {
  constructor(private service: WorkOrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List all work orders for the tenant' })
  findAll(@Request() req: any, @Query() filters: WorkOrderFiltersDto) {
    return this.service.findAll(req.user.tenantId, filters);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get work order counts by status/priority' })
  getStats(@Request() req: any) {
    return this.service.getStats(req.user.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single work order by ID' })
  @ApiParam({ name: 'id', description: 'Work Order UUID' })
  findById(@Request() req: any, @Param('id') id: string) {
    return this.service.findById(req.user.tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new work order' })
  create(@Request() req: any, @Body() dto: CreateWorkOrderDto) {
    return this.service.create(req.user.tenantId, dto);
  }

  @Post('from-alert/:alertId')
  @ApiOperation({ summary: 'Create a work order linked to an existing alert' })
  @ApiParam({ name: 'alertId', description: 'Alert UUID' })
  fromAlert(@Request() req: any, @Param('alertId') alertId: string) {
    return this.service.fromAlert(req.user.tenantId, alertId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a work order' })
  @ApiParam({ name: 'id', description: 'Work Order UUID' })
  update(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateWorkOrderDto) {
    return this.service.update(req.user.tenantId, id, dto);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Mark a work order as completed' })
  @ApiParam({ name: 'id', description: 'Work Order UUID' })
  complete(@Request() req: any, @Param('id') id: string) {
    return this.service.complete(req.user.tenantId, id);
  }
}
