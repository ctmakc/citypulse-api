import {
  Process,
  Processor,
  OnQueueCompleted,
  OnQueueFailed,
} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { QUEUE_REPORT_GENERATION } from '../queue.constants.js';
import { ReportsService } from '../../reports/reports.service.js';
import {
  isReportType,
  type GeneratedFile,
} from '../../reports/reports.types.js';

export interface ReportGenerationJobData {
  tenantId: string;
  /** One of the seven ReportType values. */
  reportType: string;
  params?: Record<string, unknown>;
  enqueuedAt: string;
}

export interface ReportArtifact {
  ok: true;
  artifactId: string;
  tenantId: string;
  reportType: string;
  /** Primary file format (first produced file). */
  format: 'pdf' | 'xlsx';
  /** Primary download URL (also present per-file in `files`). */
  url: string;
  files: GeneratedFile[];
  sizeBytes: number;
  generatedAt: string;
}

/**
 * Worker consumer for the 'report-generation' queue.
 *
 * Delegates to ReportsService to BUILD a real artifact (PDF via pdfkit / XLSX
 * via exceljs) from live Prisma data, write it to the artifacts directory, and
 * return a descriptor whose `url` points at the download endpoint.
 */
@Processor(QUEUE_REPORT_GENERATION)
export class ReportGenerationProcessor {
  private readonly logger = new Logger(ReportGenerationProcessor.name);

  constructor(private readonly reports: ReportsService) {}

  @Process()
  async handle(job: Job<ReportGenerationJobData>): Promise<ReportArtifact> {
    const { tenantId, reportType } = job.data;
    this.logger.log(
      `Generating report ${job.id} (tenant=${tenantId}, type=${reportType})`,
    );

    if (!isReportType(reportType)) {
      throw new Error(`Unknown report type '${reportType}'`);
    }

    await job.progress(10);
    // Build the real artifact(s) from Prisma data and persist to disk.
    const result = await this.reports.generate(
      tenantId,
      reportType,
      new Date(),
    );
    await job.progress(100);

    const primary = result.files[0];
    const artifact: ReportArtifact = {
      ok: true,
      artifactId: `report-${job.id}`,
      tenantId,
      reportType,
      format: primary.format,
      url: result.url,
      files: result.files,
      sizeBytes: result.files.reduce((n, f) => n + f.sizeBytes, 0),
      generatedAt: result.generatedAt,
    };

    this.logger.log(
      `report ${job.id} generated: ${artifact.files.map((f) => f.file).join(', ')}`,
    );
    return artifact;
  }

  @OnQueueCompleted()
  onCompleted(job: Job) {
    this.logger.debug(`report-generation job ${job.id} completed`);
  }

  @OnQueueFailed()
  onFailed(job: Job, err: Error) {
    this.logger.error(`report-generation job ${job.id} failed: ${err.message}`);
  }
}
