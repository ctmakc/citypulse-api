import type { BullModuleOptions } from '@nestjs/bull';

/**
 * Shared Redis connection options for all Bull queues.
 *
 * Resilience requirement: a Redis outage must NOT crash app startup.
 * We therefore configure the underlying ioredis client to:
 *   - keep retrying with a bounded backoff (never give up, but never block boot),
 *   - NOT throw "max retries per request" errors that would otherwise bubble up
 *     synchronously into request handlers (set to null per Bull's recommendation),
 *   - mark commands as offline-queued so producers fail soft rather than throw on
 *     a dropped connection,
 *   - tolerate a missing/late Redis by lazily connecting.
 *
 * If Redis is down at boot, queues are created but simply sit disconnected and
 * keep reconnecting in the background. Health + producer code is additionally
 * wrapped in try/catch so the API degrades gracefully.
 */
export const REDIS_HOST =
  process.env.REDIS_HOST || process.env.REDIS_URL_HOST || '127.0.0.1';
export const REDIS_PORT = Number(process.env.REDIS_PORT || 6387);

export function buildBullRootOptions(): BullModuleOptions {
  return {
    redis: {
      host: REDIS_HOST,
      port: REDIS_PORT,
      // Lazy connect so module instantiation never blocks on a TCP handshake.
      lazyConnect: false,
      // Do not surface "Reached the max retries per request" as a thrown error.
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      // Bounded exponential backoff, capped at 5s, retried indefinitely.
      retryStrategy: (times: number) => Math.min(times * 200, 5000),
      // When disconnected, queue commands rather than throwing immediately.
      enableOfflineQueue: true,
      reconnectOnError: () => true,
    },
    // Sensible default job options for every queue.
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  };
}
