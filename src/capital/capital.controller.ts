import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CapitalService } from './capital.service';

@ApiTags('capital')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('capital')
export class CapitalController {
  constructor(private service: CapitalService) {}

  @Get()
  findAll(@Request() req: any) {
    return this.service.findAll(req.user.tenantId);
  }
}
