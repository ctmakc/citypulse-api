import {
  Controller,
  Get,
  Patch,
  Param,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { DashboardService } from './dashboard.service.js';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Full dashboard overview — tenant info, KPIs, recent alerts, and recommended actions',
  })
  getOverview(@Request() req: any) {
    return this.service.getOverview(req.user.tenantId);
  }

  @Get('alerts')
  @ApiOperation({ summary: 'All unresolved, unacknowledged alerts for the tenant' })
  getAlerts(@Request() req: any) {
    return this.service.getAlerts(req.user.tenantId);
  }

  @Patch('alerts/:id/acknowledge')
  @ApiOperation({ summary: 'Mark an alert as acknowledged' })
  @ApiParam({ name: 'id', type: String })
  @HttpCode(HttpStatus.OK)
  acknowledgeAlert(@Request() req: any, @Param('id') id: string) {
    return this.service.acknowledgeAlert(req.user.tenantId, id);
  }
}
