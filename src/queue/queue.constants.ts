/**
 * Canonical queue names. Imported by the module registration, the processors
 * (@Processor) and the producers (@InjectQueue) so the strings never drift.
 */
export const QUEUE_AGENT_RUNS = 'agent-runs';
export const QUEUE_REPORT_GENERATION = 'report-generation';
export const QUEUE_DATA_INGEST = 'data-ingest';

export const ALL_QUEUES = [
  QUEUE_AGENT_RUNS,
  QUEUE_REPORT_GENERATION,
  QUEUE_DATA_INGEST,
] as const;

export type QueueName = (typeof ALL_QUEUES)[number];

/** Promise-based sleep — NOT a busy loop. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
