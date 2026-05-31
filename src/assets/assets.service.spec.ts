import { RiskLevel } from '@prisma/client';
import { AssetsService } from './assets.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaginatedResult } from './pagination.util';

function buildPrismaMock() {
  return {
    asset: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
}

function makeAsset(i: number) {
  return {
    id: `asset-${i}`,
    tenantId: 'tenant-1',
    externalId: `EX-${i}`,
    type: 'WATER_MAIN',
    name: `Asset ${i}`,
    condition: 80,
    failureProb: 0.1,
    riskLevel: RiskLevel.OK,
    createdAt: new Date(`2026-01-${String(i).padStart(2, '0')}T00:00:00.000Z`),
  };
}

describe('AssetsService.findAll pagination backward-compat', () => {
  let service: AssetsService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new AssetsService(prisma as unknown as PrismaService);
  });

  describe('legacy array mode (no limit)', () => {
    it('returns a plain array when no limit is supplied', async () => {
      const rows = [makeAsset(1), makeAsset(2), makeAsset(3)];
      prisma.asset.findMany.mockResolvedValue(rows);

      const result = await service.findAll('tenant-1');

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(3);
      // Must NOT be an envelope.
      expect((result as unknown as Record<string, unknown>).data).toBeUndefined();
      expect(
        (result as unknown as Record<string, unknown>).nextCursor,
      ).toBeUndefined();
      // count() is not needed in legacy mode.
      expect(prisma.asset.count).not.toHaveBeenCalled();
    });

    it('uses the legacy ordering (riskLevel desc, name asc) in array mode', async () => {
      prisma.asset.findMany.mockResolvedValue([]);

      await service.findAll('tenant-1');

      const call = prisma.asset.findMany.mock.calls[0][0];
      expect(call.orderBy).toEqual([{ riskLevel: 'desc' }, { name: 'asc' }]);
      expect(call.take).toBeUndefined();
    });

    it('returns an empty array (not an envelope) when there are no rows', async () => {
      prisma.asset.findMany.mockResolvedValue([]);
      const result = await service.findAll('tenant-1', {});
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });

  describe('envelope mode (limit supplied)', () => {
    it('returns a { data, nextCursor, total } envelope when limit is supplied', async () => {
      const rows = [makeAsset(1), makeAsset(2)];
      prisma.asset.findMany.mockResolvedValue(rows);
      prisma.asset.count.mockResolvedValue(2);

      const result = (await service.findAll('tenant-1', {
        limit: 10,
      })) as PaginatedResult<unknown>;

      expect(Array.isArray(result)).toBe(false);
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('nextCursor');
      expect(result).toHaveProperty('total');
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      // No over-fetch beyond the limit -> no further page.
      expect(result.nextCursor).toBeNull();

      // Envelope mode over-fetches (take = limit + 1) and uses stable ordering.
      const call = prisma.asset.findMany.mock.calls[0][0];
      expect(call.take).toBe(11);
      expect(call.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    });

    it('emits a nextCursor when there are more rows than the limit', async () => {
      // Over-fetch: ask for limit=2 -> service requests 3 rows; return 3 to
      // signal "there is a next page".
      const rows = [makeAsset(1), makeAsset(2), makeAsset(3)];
      prisma.asset.findMany.mockResolvedValue(rows);
      prisma.asset.count.mockResolvedValue(25);

      const result = (await service.findAll('tenant-1', {
        limit: 2,
      })) as PaginatedResult<unknown>;

      expect(result.data).toHaveLength(2); // trimmed back to the page size
      expect(result.total).toBe(25);
      expect(typeof result.nextCursor).toBe('string');
      expect(result.nextCursor).toBeTruthy();
    });
  });
});
