import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';

export type DependencyState = 'up' | 'down';
export type OverallStatus = 'ok' | 'degraded';

export interface HealthReport {
  status: OverallStatus;
  uptime: number;
  checks: {
    db: DependencyState;
    redis: DependencyState;
  };
}

/** Hard cap on how long any single dependency probe may take. */
const PROBE_TIMEOUT_MS = 1000;

const REDIS_HOST =
  process.env.REDIS_HOST || process.env.REDIS_URL_HOST || '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT || 6387);

/**
 * Liveness/readiness health checks for the API.
 *
 * Contract: the endpoint must ALWAYS respond quickly and never hang, even when a
 * dependency is unreachable. Every probe is wrapped in a short timeout and the
 * checks run concurrently via Promise.allSettled, so one slow/dead dependency
 * cannot block the others or the response.
 *
 * Overall status is 'degraded' if any dependency is down, otherwise 'ok'. The
 * HTTP layer still returns 200 in both cases — the body carries the detail.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Run all dependency probes concurrently and assemble the report.
   *
   * Uses Promise.allSettled so that even an unexpected throw inside a probe can
   * never reject this method — a rejected probe is simply treated as 'down'.
   * Combined with per-probe timeouts this guarantees the endpoint resolves fast.
   */
  async check(): Promise<HealthReport> {
    const [dbResult, redisResult] = await Promise.allSettled([
      this.checkDb(),
      this.checkRedis(),
    ]);

    const db = this.settled(dbResult);
    const redis = this.settled(redisResult);

    const status: OverallStatus =
      db === 'up' && redis === 'up' ? 'ok' : 'degraded';

    return {
      status,
      uptime: Math.round(process.uptime()),
      checks: { db, redis },
    };
  }

  /** Map a settled probe result to a dependency state ('down' on rejection). */
  private settled(result: PromiseSettledResult<DependencyState>): DependencyState {
    return result.status === 'fulfilled' ? result.value : 'down';
  }

  /** Trivial round-trip to Postgres. Any error/timeout => 'down'. */
  private async checkDb(): Promise<DependencyState> {
    try {
      await this.withTimeout(
        this.prisma.$queryRaw`SELECT 1`,
        PROBE_TIMEOUT_MS,
        'db',
      );
      return 'up';
    } catch (err) {
      this.logger.warn(`DB health probe failed: ${err}`);
      return 'down';
    }
  }

  /**
   * PING the Redis instance. Uses a short-lived ioredis client with a single
   * connection attempt (no infinite reconnect loop) so the probe fails fast
   * when Redis is unreachable. The client is always torn down.
   */
  private async checkRedis(): Promise<DependencyState> {
    let client: Redis | null = null;
    try {
      client = new Redis({
        host: REDIS_HOST,
        port: REDIS_PORT,
        lazyConnect: true,
        // Fail fast: a single connection attempt, no offline buffering.
        connectTimeout: PROBE_TIMEOUT_MS,
        commandTimeout: PROBE_TIMEOUT_MS,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
        enableOfflineQueue: false,
        // Swallow async connection errors; we surface state via the probe result.
        reconnectOnError: () => false,
      });
      // Prevent an unhandled 'error' event from crashing the process when Redis
      // is down — we only care about the ping result below.
      client.on('error', () => undefined);

      const pong = await this.withTimeout(
        client.connect().then(() => client!.ping()),
        PROBE_TIMEOUT_MS,
        'redis',
      );
      return pong === 'PONG' ? 'up' : 'down';
    } catch (err) {
      this.logger.warn(`Redis health probe failed: ${err}`);
      return 'down';
    } finally {
      if (client) {
        try {
          client.disconnect();
        } catch {
          /* ignore teardown errors */
        }
      }
    }
  }

  /** Reject if `p` does not settle within `ms` milliseconds. */
  private withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} probe timed out after ${ms}ms`)),
        ms,
      );
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
  }
}
