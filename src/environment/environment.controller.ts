import { Controller, Get, Post, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EnvironmentService } from './environment.service';

@ApiTags('environment')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('environment')
export class EnvironmentController {
  constructor(private service: EnvironmentService) {}

  @Get('air')
  @ApiOperation({ summary: 'Current AQI + recent 12h history' })
  async getAir(@Request() req: any) {
    const tenantId: string = req.user.tenantId;
    const [current, history] = await Promise.all([
      this.service.getCurrentAQI(tenantId),
      this.service.getAirHistory(tenantId, 12),
    ]);
    return { ...current, history };
  }

  @Get('water')
  @ApiOperation({ summary: 'Water quality metrics' })
  getWater(@Request() req: any) {
    return this.service.getWaterQuality(req.user.tenantId);
  }

  @Get('wildfire')
  @ApiOperation({ summary: 'Wildfire risk assessment' })
  getWildfire(@Request() req: any) {
    return this.service.getWildfireRisk(req.user.tenantId);
  }

  @Get('flood')
  @ApiOperation({ summary: 'Flood risk assessment' })
  getFlood(@Request() req: any) {
    return this.service.getFloodRisk(req.user.tenantId);
  }

  @Post('seed')
  @ApiOperation({ summary: 'Seed 24h AQI readings (admin/dev use)' })
  seed(@Request() req: any) {
    return this.service.seedReadings(req.user.tenantId);
  }
}
