import { PrismaService } from '../prisma/prisma.service';

/**
 * Controllable ioredis mock. Each test can set `nextRedisBehavior` to shape the
 * connect/ping outcome of the NEXT client the service constructs. No real Redis
 * is ever contacted, and there are no nondeterministic values.
 */
type RedisBehavior = {
  connectRejects?: boolean;
  pingReply?: string;
};

let nextRedisBehavior: RedisBehavior = {};
const createdRedisClients: Array<{ disconnect: jest.Mock }> = [];

jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => {
      const behavior = nextRedisBehavior;
      const instance = {
        connect: behavior.connectRejects
          ? jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))
          : jest.fn().mockResolvedValue(undefined),
        ping: jest.fn().mockResolvedValue(behavior.pingReply ?? 'PONG'),
        on: jest.fn(),
        disconnect: jest.fn(),
      };
      createdRedisClients.push(instance);
      return instance;
    }),
  };
});

// Import AFTER the mock is registered.
import { HealthService } from './health.service';

function buildPrismaMock() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  };
}

describe('HealthService', () => {
  let service: HealthService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(() => {
    nextRedisBehavior = {};
    createdRedisClients.length = 0;
    prisma = buildPrismaMock();
    service = new HealthService(prisma as unknown as PrismaService);
  });

  it("returns status 'ok' with both checks up when db and redis respond", async () => {
    const report = await service.check();

    expect(report.status).toBe('ok');
    expect(report.checks).toEqual({ db: 'up', redis: 'up' });
    expect(typeof report.uptime).toBe('number');
    expect(report.uptime).toBeGreaterThanOrEqual(0);
    // A redis client was created and torn down.
    expect(createdRedisClients).toHaveLength(1);
    expect(createdRedisClients[0].disconnect).toHaveBeenCalled();
  });

  it("reports db 'down' and overall 'degraded' when the DB query rejects", async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));

    const report = await service.check();

    expect(report.checks.db).toBe('down');
    expect(report.checks.redis).toBe('up');
    expect(report.status).toBe('degraded');
  });

  it("reports redis 'down' and overall 'degraded' when connect fails", async () => {
    nextRedisBehavior = { connectRejects: true };

    const report = await service.check();

    expect(report.checks.redis).toBe('down');
    expect(report.checks.db).toBe('up');
    expect(report.status).toBe('degraded');
    // Even on failure, the client must be disconnected (no leak).
    expect(createdRedisClients[0].disconnect).toHaveBeenCalled();
  });

  it("reports redis 'down' when PING returns a non-PONG reply", async () => {
    nextRedisBehavior = { pingReply: 'WEIRD' };

    const report = await service.check();

    expect(report.checks.redis).toBe('down');
    expect(report.status).toBe('degraded');
  });
});
