import { DynamicModule, Logger, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import {
  QUEUE_AGENT_RUNS,
  QUEUE_REPORT_GENERATION,
  QUEUE_DATA_INGEST,
} from './queue.constants';
import { AgentRunsProcessor } from './processors/agent-runs.processor';
import { ReportGenerationProcessor } from './processors/report-generation.processor';
import { DataIngestProcessor } from './processors/data-ingest.processor';
import { QueueService } from './queue.service';
import { JobsController } from './jobs.controller';

/**
 * QueueModule
 *
 * Registers the three background queues ('agent-runs', 'report-generation',
 * 'data-ingest'), their worker processors, the producer/introspection service
 * and the JobsController.
 *
 * Resilience: queue registration is guarded. A Redis outage does NOT crash boot:
 *   - ioredis is configured (see redis-options.ts) to reconnect indefinitely with
 *     bounded backoff and to NOT throw max-retries errors, so BullModule can be
 *     instantiated even when Redis is unreachable.
 *   - registration is additionally wrapped in try/catch; if it somehow throws,
 *     we fall back to a degraded module that still provides QueueService +
 *     JobsController (which report "unavailable" rather than 500-ing the app).
 *   - set QUEUE_DISABLED=1 to skip the queues entirely (e.g. CI without Redis).
 */
@Module({})
export class QueueModule {
  private static readonly logger = new Logger(QueueModule.name);

  static register(): DynamicModule {
    const disabled = process.env.QUEUE_DISABLED === '1';

    if (disabled) {
      QueueModule.logger.warn(
        'QUEUE_DISABLED=1 — queues are NOT registered; running in degraded mode.',
      );
      return {
        module: QueueModule,
        controllers: [JobsController],
        providers: [
          { provide: QueueService, useValue: createDegradedQueueService() },
        ],
        exports: [QueueService],
      };
    }

    try {
      const queueImports = [
        BullModule.registerQueue({ name: QUEUE_AGENT_RUNS }),
        BullModule.registerQueue({ name: QUEUE_REPORT_GENERATION }),
        BullModule.registerQueue({ name: QUEUE_DATA_INGEST }),
      ];

      return {
        module: QueueModule,
        imports: queueImports,
        controllers: [JobsController],
        providers: [
          QueueService,
          AgentRunsProcessor,
          ReportGenerationProcessor,
          DataIngestProcessor,
        ],
        exports: [QueueService, BullModule],
      };
    } catch (err) {
      QueueModule.logger.error(
        `Queue registration failed — booting in degraded mode: ${(err as Error).message}`,
      );
      return {
        module: QueueModule,
        controllers: [JobsController],
        providers: [
          { provide: QueueService, useValue: createDegradedQueueService() },
        ],
        exports: [QueueService],
      };
    }
  }
}

/**
 * A QueueService stand-in used when queues could not be registered. It satisfies
 * the public surface but reports the backend as unavailable, so the rest of the
 * app keeps running.
 */
function createDegradedQueueService(): Partial<QueueService> {
  const unavailable = async () => {
    throw new Error('Queue backend disabled/unavailable');
  };
  return {
    enqueueAgentRun: unavailable as any,
    enqueueReport: unavailable as any,
    enqueueDataIngest: unavailable as any,
    getJobState: (async () => null) as any,
    health: (async () => ({
      ok: false,
      redis: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: Number(process.env.REDIS_PORT || 6387),
        status: 'disabled',
      },
      queues: [],
    })) as any,
  };
}
