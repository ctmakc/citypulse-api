import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TrafficService } from './traffic.service';

@ApiTags('traffic')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('traffic')
export class TrafficController {
  constructor(private service: TrafficService) {}

  @Get()
  @ApiOperation({ summary: 'Current traffic overview — congestion index, hotspots, delay' })
  getCurrent(@Request() req: any) {
    return this.service.getCurrent(req.user.tenantId);
  }

  @Get('hourly')
  @ApiOperation({ summary: '24-hour delay index pattern for today' })
  getHourly(@Request() req: any) {
    return this.service.getHourlyPattern(req.user.tenantId);
  }

  @Get('intersections')
  @ApiOperation({ summary: 'Intersection level-of-service performance table' })
  getIntersections(@Request() req: any) {
    return this.service.getIntersections(req.user.tenantId);
  }

  @Get('heatgrid')
  @ApiOperation({ summary: 'Day × hour congestion heat-grid (7 days × 12 time slots)' })
  getHeatGrid(@Request() req: any) {
    return this.service.getHeatGrid(req.user.tenantId);
  }
}
