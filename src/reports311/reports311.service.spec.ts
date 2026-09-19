import { NotFoundException } from '@nestjs/common';
import { ReportStatus } from '@prisma/client';
import { Reports311Service } from './reports311.service';
import { PrismaService } from '../prisma/prisma.service';

function buildPrismaMock() {
  return {
    report311: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  };
}

describe('Reports311Service', () => {
  let service: Reports311Service;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new Reports311Service(prisma as unknown as PrismaService);
  });

  describe('route() — category -> department routing', () => {
    // (category, expected department) — drawn from the service's routing table.
    const routingCases: Array<[string, string]> = [
      ['Pothole', 'Public Works'],
      ['Road ice', 'Public Works'],
      ['Damaged sign', 'Public Works'],
      ['Flooding', 'Water Authority'],
      ['Water leak', 'Water Authority'],
      ['Streetlight out', 'Utilities'],
      ['Fallen tree', 'Parks'],
      ['Illegal dumping', 'Sanitation'],
      ['Pollution', 'Environment'],
      ['Noise', 'Bylaw'],
    ];

    it.each(routingCases)(
      'routes "%s" to "%s" and marks it ASSIGNED',
      async (category, expectedDept) => {
        prisma.report311.findFirst.mockResolvedValue({
          id: 'r-1',
          tenantId: 'tenant-1',
          category,
        });
        prisma.report311.update.mockImplementation(({ data }: any) =>
          Promise.resolve({ id: 'r-1', ...data }),
        );

        await service.route('tenant-1', 'r-1');

        expect(prisma.report311.update).toHaveBeenCalledWith({
          where: { id: 'r-1' },
          data: { department: expectedDept, status: ReportStatus.ASSIGNED },
        });
      },
    );

    it('routes an unknown category to the "General Services" fallback', async () => {
      prisma.report311.findFirst.mockResolvedValue({
        id: 'r-2',
        tenantId: 'tenant-1',
        category: 'Aliens landed',
      });
      prisma.report311.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'r-2', ...data }),
      );

      await service.route('tenant-1', 'r-2');

      expect(prisma.report311.update).toHaveBeenCalledWith({
        where: { id: 'r-2' },
        data: { department: 'General Services', status: ReportStatus.ASSIGNED },
      });
    });
  });

  describe('trackByCode()', () => {
    it('returns only the safe, non-sensitive fields for a known code', async () => {
      const safeRow = {
        trackingCode: '311-ABC-XYZ',
        status: ReportStatus.IN_PROGRESS,
        category: 'Pothole',
        location: 'Main St & 1st Ave',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: new Date('2026-03-02T00:00:00.000Z'),
        resolvedAt: null,
      };
      prisma.report311.findUnique.mockResolvedValue(safeRow);

      const result = await service.trackByCode('311-ABC-XYZ');

      // Lookup is by trackingCode (the code is the secret; not tenant-scoped).
      const callArg = prisma.report311.findUnique.mock.calls[0][0];
      expect(callArg.where).toEqual({ trackingCode: '311-ABC-XYZ' });

      // The select must restrict to safe fields and NOT expose PII / internals.
      expect(callArg.select).toMatchObject({
        trackingCode: true,
        status: true,
        category: true,
        location: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
      });
      expect(callArg.select.submitterEmail).toBeUndefined();
      expect(callArg.select.description).toBeUndefined();
      expect(callArg.select.locationLat).toBeUndefined();
      expect(callArg.select.locationLng).toBeUndefined();

      expect(result).toEqual(safeRow);
    });

    it('throws NotFoundException for an unknown tracking code', async () => {
      prisma.report311.findUnique.mockResolvedValue(null);

      await expect(service.trackByCode('311-DOES-NOT-EXIST')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
