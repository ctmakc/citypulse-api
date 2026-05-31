import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TrafficService } from './traffic.service';

@ApiTags('traffic')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('traffic')
export class TrafficController {
  constructor(private service: TrafficService) {}

  @Get()
  findAll(@Request() req: any) {
    return this.service.findAll(req.user.tenantId);
  }
}
