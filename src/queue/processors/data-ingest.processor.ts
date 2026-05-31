import {
  Process,
  Processor,
  OnQueueCompleted,
  OnQueueFailed,
} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { QUEUE_DATA_INGEST, sleep } from '../queue.constants';

export interface DataIngestJobData {
  tenantId: string;
  source: string;
  batchSize?: number;
  enqueuedAt: string;
}

export interface DataIngestJobResult {
  ok: true;
  tenantId: string;
  source: string;
  ingestedCount: number;
  finishedAt: string;
}

/**
 * Worker consumer for the 'data-ingest' queue.
 *
 * Simulates ingesting a batch using a Promise-based delay (NOT a busy loop) and
 * resolves with a count of records ingested.
 */
@Processor(QUEUE_DATA_INGEST)
export class DataIngestProcessor {
  private readonly logger = new Logger(DataIngestProcessor.name);

  @Process()
  async handle(job: Job<DataIngestJobData>): Promise<DataIngestJobResult> {
    const { tenantId, source } = job.data;
    const batchSize = job.data.batchSize ?? 100;
    this.logger.log(
      `Ingesting batch ${job.id} (tenant=${tenantId}, source=${source}, size=${batchSize})`,
    );

    // Simulate I/O-bound ingest without burning CPU.
    await sleep(500);

    const result: DataIngestJobResult = {
      ok: true,
      tenantId,
      source,
      ingestedCount: batchSize,
      finishedAt: new Date().toISOString(),
    };

    this.logger.log(`data-ingest job ${job.id} ingested ${batchSize} records`);
    return result;
  }

  @OnQueueCompleted()
  onCompleted(job: Job) {
    this.logger.debug(`data-ingest job ${job.id} completed`);
  }

  @OnQueueFailed()
  onFailed(job: Job, err: Error) {
    this.logger.error(`data-ingest job ${job.id} failed: ${err.message}`);
  }
}
