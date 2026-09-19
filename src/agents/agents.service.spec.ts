import { RiskLevel } from '@prisma/client';
import { AgentsService } from './agents.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Build a PrismaService mock whose finders all return "empty" by default, so the
 * agents fall back cleanly. Individual tests override the specific finder they
 * care about. Keeps every test deterministic — no real DB, no random values.
 */
function buildPrismaMock() {
  return {
    agentRun: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
    },
    asset: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    report311: {
      groupBy: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
    capitalProject: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    environmentalReading: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    alert: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
    trafficReading: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    workOrder: {
      count: jest.fn().mockResolvedValue(0),
    },
    tenant: {
      findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1', riskLabel: 'Normal' }),
    },
  };
}

function makeAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: 'asset-1',
    externalId: 'WM-001',
    tenantId: 'tenant-1',
    name: 'Main St Water Main',
    type: 'WATER_MAIN',
    district: 'Downtown',
    condition: 30,
    failureProb: 0.8,
    riskLevel: RiskLevel.CRITICAL,
    ...overrides,
  };
}

describe('AgentsService', () => {
  let service: AgentsService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new AgentsService(prisma as unknown as PrismaService);
    // Ensure no LLM phrasing path is taken in tests.
    delete process.env.GEMINI_API_KEY;
  });

  describe('getAllAgents', () => {
    it('returns exactly 9 agents', async () => {
      const agents = await service.getAllAgents('tenant-1');
      expect(agents).toHaveLength(9);
    });

    it('returns the full set of agent keys', async () => {
      const agents = await service.getAllAgents('tenant-1');
      const keys = agents.map((a) => a.key).sort();
      expect(keys).toEqual(
        [
          'air',
          'citizen',
          'emergency',
          'fire',
          'flood',
          'grants',
          'road',
          'traffic',
          'water',
        ].sort(),
      );
    });

    it('every agent carries its presentation metadata (name + dept)', async () => {
      const agents = await service.getAllAgents('tenant-1');
      for (const a of agents) {
        expect(a.name).toBeTruthy();
        expect(a.dept).toBeTruthy();
        expect(Array.isArray(a.sources)).toBe(true);
      }
    });
  });

  describe('data-driven analysis (via getAllAgents)', () => {
    it('picks the worst-condition asset and maps a CRITICAL risk to a Critical escalation for the water agent', async () => {
      // findFirst is called with orderBy condition asc -> the DB returns the worst.
      // We assert the service maps that worst row's riskLevel -> escalation.
      prisma.asset.findFirst.mockImplementation(({ where }: any) => {
        const types: string[] = where?.type?.in ?? [];
        if (types.includes('WATER_MAIN')) {
          return Promise.resolve(makeAsset({ riskLevel: RiskLevel.CRITICAL, condition: 22 }));
        }
        return Promise.resolve(null);
      });

      const agents = await service.getAllAgents('tenant-1');
      const water = agents.find((a) => a.key === 'water')!;

      expect(water.esc).toBe('Critical');
      // Critical escalation -> "Action required" status (escalationToStatus).
      expect(water.status).toBe('Action required');
      // Finding is derived from the real row (mentions its externalId + condition).
      expect(water.finding).toContain('WM-001');
      expect(water.finding).toContain('22');

      // It ordered by worst condition first.
      const waterCall = prisma.asset.findFirst.mock.calls.find(
        ([arg]: any) => (arg?.where?.type?.in ?? []).includes('WATER_MAIN'),
      );
      expect(waterCall?.[0].orderBy).toEqual([
        { condition: 'asc' },
        { failureProb: 'desc' },
      ]);
    });

    it('maps each RiskLevel to the correct escalation band', async () => {
      const cases: Array<[RiskLevel, string]> = [
        [RiskLevel.CRITICAL, 'Critical'],
        [RiskLevel.ELEVATED, 'Elevated'],
        [RiskLevel.WATCH, 'Watch'],
        [RiskLevel.OK, 'Info'],
      ];

      for (const [risk, expectedEsc] of cases) {
        const localPrisma = buildPrismaMock();
        localPrisma.asset.findFirst.mockImplementation(({ where }: any) => {
          const types: string[] = where?.type?.in ?? [];
          if (types.includes('WATER_MAIN')) {
            return Promise.resolve(makeAsset({ riskLevel: risk, condition: 50 }));
          }
          return Promise.resolve(null);
        });
        const localService = new AgentsService(localPrisma as unknown as PrismaService);

        const agents = await localService.getAllAgents('tenant-1');
        const water = agents.find((a) => a.key === 'water')!;
        expect(water.esc).toBe(expectedEsc);
      }
    });

    it('falls back to standby/info when there is genuinely no data', async () => {
      // All finders already return empty in the default mock.
      const agents = await service.getAllAgents('tenant-1');
      const water = agents.find((a) => a.key === 'water')!;
      expect(water.esc).toBe('Info');
      expect(water.finding).toMatch(/no water assets/i);
    });
  });
});
