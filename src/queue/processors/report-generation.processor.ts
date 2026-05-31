import {
  Process,
  Processor,
  OnQueueCompleted,
  OnQueueFailed,
} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { QUEUE_REPORT_GENERATION, sleep } from '../queue.constants';

export interface ReportGenerationJobData {
  tenantId: string;
  reportType: string;
  params?: Record<string, unknown>;
  enqueuedAt: string;
}

export interface ReportArtifact {
  ok: true;
  artifactId: string;
  tenantId: string;
  reportType: string;
  format: 'pdf';
  url: string;
  sizeBytes: number;
  generatedAt: string;
}

/**
 * Worker consumer for the 'report-generation' queue.
 *
 * Simulates building a report using a Promise-based delay (NOT a busy loop) and
 * resolves with a fake artifact descriptor.
 */
@Processor(QUEUE_REPORT_GENERATION)
export class ReportGenerationProcessor {
  private readonly logger = new Logger(ReportGenerationProcessor.name);

  @Process()
  async handle(job: Job<ReportGenerationJobData>): Promise<ReportArtifact> {
    const { tenantId, reportType } = job.data;
    this.logger.log(
      `Generating report ${job.id} (tenant=${tenantId}, type=${reportType})`,
    );

    // Simulate work in stages, reporting progress along the way.
    await job.progress(10);
    await sleep(400); // gather data
    await job.progress(55);
    await sleep(400); // render
    await job.progress(90);
    await sleep(200); // finalize
    await job.progress(100);

    const artifact: ReportArtifact = {
      ok: true,
      artifactId: `report-${job.id}`,
      tenantId,
      reportType,
      format: 'pdf',
      url: `https://artifacts.citypulse.local/${tenantId}/report-${job.id}.pdf`,
      sizeBytes: 256 * 1024,
      generatedAt: new Date().toISOString(),
    };

    this.logger.log(`report ${job.id} generated: ${artifact.url}`);
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
