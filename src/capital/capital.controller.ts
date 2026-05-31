import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CapitalService } from './capital.service';
import { CreateCapitalProjectDto } from './dto/create-capital-project.dto';
import { UpdateCapitalProjectDto } from './dto/update-capital-project.dto';

@ApiTags('capital')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('capital')
export class CapitalController {
  constructor(private service: CapitalService) {}

  @Get()
  @ApiOperation({ summary: 'List all capital projects for the tenant' })
  findAll(@Request() req: any) {
    return this.service.findAll(req.user.tenantId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get capital planning summary stats' })
  getStats(@Request() req: any) {
    return this.service.getStats(req.user.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single capital project by ID' })
  @ApiParam({ name: 'id', description: 'Capital Project UUID' })
  findById(@Request() req: any, @Param('id') id: string) {
    return this.service.findById(req.user.tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new capital project' })
  create(@Request() req: any, @Body() dto: CreateCapitalProjectDto) {
    return this.service.create(req.user.tenantId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a capital project' })
  @ApiParam({ name: 'id', description: 'Capital Project UUID' })
  update(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateCapitalProjectDto) {
    return this.service.update(req.user.tenantId, id, dto);
  }
}
