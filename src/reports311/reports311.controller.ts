import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Reports311Service } from './reports311.service';

@ApiTags('reports311')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports311')
export class Reports311Controller {
  constructor(private service: Reports311Service) {}

  @Get()
  findAll(@Request() req: any) {
    return this.service.findAll(req.user.tenantId);
  }
}
