import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EnvironmentService } from './environment.service';

@ApiTags('environment')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('environment')
export class EnvironmentController {
  constructor(private service: EnvironmentService) {}

  @Get()
  findAll(@Request() req: any) {
    return this.service.findAll(req.user.tenantId);
  }
}
