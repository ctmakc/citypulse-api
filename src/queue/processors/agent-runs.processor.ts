import {
  Process,
  Processor,
  OnQueueActive,
  OnQueueCompleted,
  OnQueueFailed,
} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { QUEUE_AGENT_RUNS } from '../queue.constants';

export interface AgentRunJobData {
  tenantId: string;
  key: string;
  enqueuedAt: string;
}

export interface AgentRunJobResult {
  ok: true;
  tenantId: string;
  key: string;
  processedAt: string;
}

/**
 * Worker consumer for the 'agent-runs' queue.
 *
 * Represents the periodic agent refresh moving off the request path. For now it
 * simply logs and marks the job done. Wiring it to AgentsService.runAgent() is a
 * future step and must go through DI/events only (we do not own the agents module).
 */
@Processor(QUEUE_AGENT_RUNS)
export class AgentRunsProcessor {
  private readonly logger = new Logger(AgentRunsProcessor.name);

  @Process()
  async handle(job: Job<AgentRunJobData>): Promise<AgentRunJobResult> {
    const { tenantId, key } = job.data;
    this.logger.log(
      `Processing agent-run job ${job.id} (tenant=${tenantId}, agent=${key})`,
    );

    // Placeholder for the real agent refresh. Intentionally a no-op compute.
    const result: AgentRunJobResult = {
      ok: true,
      tenantId,
      key,
      processedAt: new Date().toISOString(),
    };

    this.logger.log(`agent-run job ${job.id} done`);
    return result;
  }

  @OnQueueActive()
  onActive(job: Job) {
    this.logger.debug(`agent-runs job ${job.id} started`);
  }

  @OnQueueCompleted()
  onCompleted(job: Job) {
    this.logger.debug(`agent-runs job ${job.id} completed`);
  }

  @OnQueueFailed()
  onFailed(job: Job, err: Error) {
    this.logger.error(`agent-runs job ${job.id} failed: ${err.message}`);
  }
}
