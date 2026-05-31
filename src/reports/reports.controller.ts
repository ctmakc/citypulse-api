import {
  Controller,
  Get,
  Post,
  Param,
  Res,
  UseGuards,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { QUEUE_REPORT_GENERATION } from '../queue/queue.constants.js';
import type { ReportGenerationJobData } from '../queue/processors/report-generation.processor.js';
import { ReportsService } from './reports.service.js';
import { REPORT_TYPES, downloadUrlFor, isReportType } from './reports.types.js';

/**
 * Race a Redis round-trip against a short timeout so a dead Redis (with
 * offline-queueing on) fails fast instead of hanging the HTTP request. Mirrors
 * QueueService.withTimeout so behaviour is consistent across the app.
 */
function withTimeout<T>(p: Promise<T>, ms = 1500): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_resolve, reject) =>
      setTimeout(() => reject(new Error(`Redis timed out after ${ms}ms`)), ms),
    ),
  ]);
}

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  private readonly logger = new Logger(ReportsController.name);

  constructor(
    private readonly reports: ReportsService,
    // Reuse the existing 'report-generation' queue (same name/Redis as the rest
    // of the app). Injected directly to avoid a circular module dependency with
    // QueueModule (which imports ReportsModule for the processor).
    @InjectQueue(QUEUE_REPORT_GENERATION) private readonly queue: Queue,
  ) {}

  // -----------------------------------------------------------------------
  // Generate (enqueue, with synchronous fallback if the queue is down)
  // -----------------------------------------------------------------------
  @Post(':type/generate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Generate a report of :type. Enqueues a report-generation job and ' +
      'returns { jobId }. Falls back to synchronous generation if the queue ' +
      'backend is unavailable (jobId="sync:<file>", url returned immediately).',
  })
  @ApiParam({ name: 'type', enum: REPORT_TYPES as unknown as string[] })
  async generate(
    @Param('type') type: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ jobId: string; type: string; sync?: boolean; url?: string }> {
    if (!isReportType(type)) {
      throw new BadRequestException(
        `Unknown report type '${type}'. Valid: ${REPORT_TYPES.join(', ')}`,
      );
    }
    const tenantId = user.tenantId;

    // Try the queue first; if Redis/queue is unavailable or slow, generate
    // inline so a download still works in the demo.
    try {
      const job = await withTimeout(
        this.queue.add({
          tenantId,
          reportType: type,
          enqueuedAt: new Date().toISOString(),
        } as ReportGenerationJobData),
      );
      return { jobId: String(job.id), type };
    } catch (err) {
      this.logger.warn(
        `Queue unavailable (${(err as Error).message}); generating report synchronously`,
      );
      const result = await this.reports.generate(tenantId, type);
      return {
        jobId: `sync:${result.files[0].file}`,
        type,
        sync: true,
        url: result.url,
      };
    }
  }

  // -----------------------------------------------------------------------
  // Job status → { state, url? }
  // -----------------------------------------------------------------------
  @Get(':jobId/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Report job status. Returns { state, url? } — url is present once the ' +
      'job has completed (or immediately for a synchronous fallback job).',
  })
  @ApiParam({ name: 'jobId', description: 'Bull job id, or sync:<file>' })
  async status(
    @Param('jobId') jobId: string,
  ): Promise<{ state: string; url?: string; files?: string[] }> {
    // Synchronous-fallback "jobs" encode the produced file in the id.
    if (jobId.startsWith('sync:')) {
      const file = jobId.slice('sync:'.length);
      return { state: 'completed', url: downloadUrlFor(file) };
    }

    let job: Awaited<ReturnType<Queue['getJob']>>;
    try {
      job = await withTimeout(this.queue.getJob(jobId));
    } catch (err) {
      this.logger.warn(`getJob failed: ${(err as Error).message}`);
      return { state: 'unknown' };
    }
    if (!job) {
      throw new NotFoundException(`Report job ${jobId} not found`);
    }

    const state = await withTimeout(job.getState()).catch(() => 'unknown');

    const result = job.returnvalue as
      | { url?: string; files?: Array<{ url: string }> }
      | null
      | undefined;
    const url = state === 'completed' && result ? result.url : undefined;
    const files =
      state === 'completed' && result?.files
        ? result.files.map((f) => f.url)
        : undefined;

    return {
      state: String(state),
      ...(url ? { url } : {}),
      ...(files ? { files } : {}),
    };
  }

  // -----------------------------------------------------------------------
  // Download (stream from disk with correct headers)
  // -----------------------------------------------------------------------
  @Get('download/:file')
  @ApiOperation({
    summary:
      'Stream a generated report file with the correct Content-Type and ' +
      'Content-Disposition. Reads the artifact from disk (not static hosting).',
  })
  @ApiParam({ name: 'file', description: 'Artifact filename' })
  async download(
    @Param('file') file: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, contentType, fileName, sizeBytes } =
      await this.reports.openForDownload(file);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': String(sizeBytes),
      'Cache-Control': 'no-store',
    });
    return stream;
  }
}
