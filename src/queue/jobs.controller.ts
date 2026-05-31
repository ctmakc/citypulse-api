import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { QueueService } from './queue.service';

class EnqueueReportDto {
  @IsString()
  reportType!: string;

  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}

@ApiTags('jobs')
@ApiBearerAuth()
@Controller('jobs')
export class JobsController {
  constructor(private readonly queue: QueueService) {}

  @Get('health')
  @ApiOperation({ summary: 'Queue + Redis connectivity health' })
  health() {
    // Intentionally unauthenticated-friendly: returns connectivity status.
    return this.queue.health();
  }

  @Post('report')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Enqueue a report-generation job' })
  async enqueueReport(@Request() req: any, @Body() dto: EnqueueReportDto) {
    const tenantId =
      req.user?.tenantId || req.tenantId || 'meridian-tenant-id';
    const jobId = await this.queue.enqueueReport(
      tenantId,
      dto.reportType,
      dto.params,
    );
    return { jobId, queue: 'report-generation', status: 'queued' };
  }

  @Get(':queue/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get job state / result for a queue' })
  @ApiParam({
    name: 'queue',
    enum: ['agent-runs', 'report-generation', 'data-ingest'],
  })
  @ApiParam({ name: 'id', description: 'Bull job id' })
  async getJob(@Param('queue') queue: string, @Param('id') id: string) {
    const state = await this.queue.getJobState(queue, id);
    if (!state) {
      throw new NotFoundException(`Job ${id} not found in queue ${queue}`);
    }
    return state;
  }
}
