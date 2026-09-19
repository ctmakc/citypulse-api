import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue, JobStatus } from 'bull';
import {
  QUEUE_AGENT_RUNS,
  QUEUE_REPORT_GENERATION,
  QUEUE_DATA_INGEST,
  ALL_QUEUES,
  QueueName,
} from './queue.constants';
import type { AgentRunJobData } from './processors/agent-runs.processor';
import type { ReportGenerationJobData } from './processors/report-generation.processor';
import type { DataIngestJobData } from './processors/data-ingest.processor';

export interface JobStateView {
  id: string | number;
  name: string;
  queue: string;
  state: JobStatus | 'stuck' | 'unknown';
  progress: number | object;
  attemptsMade: number;
  data: unknown;
  result: unknown;
  failedReason: string | null;
  timestamp: number | null;
  finishedOn: number | null;
}

export interface QueueHealthEntry {
  queue: string;
  connected: boolean;
  counts?: Record<string, number>;
  error?: string;
}

export interface QueueHealth {
  ok: boolean;
  redis: { host: string; port: number; status: string };
  queues: QueueHealthEntry[];
}

/**
 * Producer + introspection service for all background queues.
 *
 * Every Redis interaction is wrapped so that a Redis outage degrades gracefully
 * (returns a 503 to callers / reports unhealthy) instead of throwing raw
 * connection errors or crashing the process.
 */
@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue(QUEUE_AGENT_RUNS) private readonly agentRuns: Queue,
    @InjectQueue(QUEUE_REPORT_GENERATION) private readonly reports: Queue,
    @InjectQueue(QUEUE_DATA_INGEST) private readonly ingest: Queue,
  ) {}

  /**
   * Race a Redis round-trip against a short timeout. With a dead Redis and
   * offline-queueing enabled, ioredis would otherwise buffer the command until
   * reconnect, hanging the HTTP request. This makes introspection fail fast so
   * the API degrades gracefully (reports "down") instead of blocking.
   */
  private withTimeout<T>(p: Promise<T>, ms = 1500): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_resolve, reject) =>
        setTimeout(
          () => reject(new Error(`Redis operation timed out after ${ms}ms`)),
          ms,
        ),
      ),
    ]);
  }

  private queueByName(name: string): Queue | undefined {
    switch (name) {
      case QUEUE_AGENT_RUNS:
        return this.agentRuns;
      case QUEUE_REPORT_GENERATION:
        return this.reports;
      case QUEUE_DATA_INGEST:
        return this.ingest;
      default:
        return undefined;
    }
  }

  // ---- Producers --------------------------------------------------------

  /** Enqueue a periodic agent refresh off the request path. */
  async enqueueAgentRun(tenantId: string, key: string): Promise<string> {
    try {
      const job = await this.agentRuns.add(
        { tenantId, key, enqueuedAt: new Date().toISOString() } as AgentRunJobData,
      );
      return String(job.id);
    } catch (err) {
      this.logger.error(
        `enqueueAgentRun failed (Redis down?): ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException('Queue backend unavailable');
    }
  }

  /** Enqueue a report-generation job; returns the jobId. */
  async enqueueReport(
    tenantId: string,
    reportType: string,
    params?: Record<string, unknown>,
  ): Promise<string> {
    try {
      const job = await this.reports.add({
        tenantId,
        reportType,
        params,
        enqueuedAt: new Date().toISOString(),
      } as ReportGenerationJobData);
      return String(job.id);
    } catch (err) {
      this.logger.error(
        `enqueueReport failed (Redis down?): ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException('Queue backend unavailable');
    }
  }

  /** Enqueue a data-ingest job; returns the jobId. */
  async enqueueDataIngest(
    tenantId: string,
    source: string,
    batchSize?: number,
  ): Promise<string> {
    try {
      const job = await this.ingest.add({
        tenantId,
        source,
        batchSize,
        enqueuedAt: new Date().toISOString(),
      } as DataIngestJobData);
      return String(job.id);
    } catch (err) {
      this.logger.error(
        `enqueueDataIngest failed (Redis down?): ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException('Queue backend unavailable');
    }
  }

  // ---- Introspection ----------------------------------------------------

  async getJobState(
    queueName: string,
    id: string,
  ): Promise<JobStateView | null> {
    const queue = this.queueByName(queueName);
    if (!queue) return null;
    try {
      const job = await this.withTimeout(queue.getJob(id));
      if (!job) return null;
      const state = (await this.withTimeout(job.getState()).catch(
        () => 'unknown',
      )) as
        | JobStatus
        | 'stuck'
        | 'unknown';
      return {
        id: job.id,
        name: job.name,
        queue: queueName,
        state,
        progress: job.progress(),
        attemptsMade: job.attemptsMade,
        data: job.data,
        result: job.returnvalue ?? null,
        failedReason: job.failedReason ?? null,
        timestamp: job.timestamp ?? null,
        finishedOn: job.finishedOn ?? null,
      };
    } catch (err) {
      this.logger.error(
        `getJobState failed (Redis down?): ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException('Queue backend unavailable');
    }
  }

  /** Queue + Redis connectivity report. Never throws. */
  async health(): Promise<QueueHealth> {
    const host = process.env.REDIS_HOST || '127.0.0.1';
    const port = Number(process.env.REDIS_PORT || 6387);

    const entries: QueueHealthEntry[] = [];
    let allConnected = true;
    let redisStatus = 'unknown';

    for (const name of ALL_QUEUES as readonly QueueName[]) {
      const queue = this.queueByName(name)!;
      try {
        // getJobCounts performs a real round-trip to Redis (fail-fast on outage).
        const counts = (await this.withTimeout(
          queue.getJobCounts(),
        )) as unknown as Record<string, number>;
        const client: any = await queue.client;
        redisStatus = client?.status ?? redisStatus;
        entries.push({ queue: name, connected: true, counts });
      } catch (err) {
        allConnected = false;
        entries.push({
          queue: name,
          connected: false,
          error: (err as Error).message,
        });
      }
    }

    return {
      ok: allConnected,
      redis: { host, port, status: allConnected ? redisStatus : 'down' },
      queues: entries,
    };
  }
}
