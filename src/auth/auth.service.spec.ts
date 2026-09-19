import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService, SafeUser } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('bcrypt');

const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

// A deterministic stored user row (as Prisma would return it, WITH passwordHash).
const STORED_USER = {
  id: 'user-1',
  tenantId: 'tenant-1',
  email: 'jane@meridian.gov',
  name: 'Jane Smith',
  role: UserRole.CITY_MANAGER,
  department: 'Public Works',
  passwordHash: '$2b$12$deterministichashvalue',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: { findUnique: jest.Mock; findFirst: jest.Mock } };
  let jwt: { sign: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    jwt = {
      sign: jest.fn().mockReturnValue('signed.jwt.token'),
    };
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
    );
    jest.clearAllMocks();
    jwt.sign.mockReturnValue('signed.jwt.token');
  });

  describe('validateUser', () => {
    it('returns null when the user is not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.validateUser(
        'nobody@meridian.gov',
        'whatever',
        'tenant-1',
      );

      expect(result).toBeNull();
      expect(mockedBcrypt.compare).not.toHaveBeenCalled();
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { tenantId_email: { tenantId: 'tenant-1', email: 'nobody@meridian.gov' } },
      });
    });

    it('returns null on a bad password', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...STORED_USER });
      mockedBcrypt.compare.mockResolvedValue(false as never);

      const result = await service.validateUser(
        STORED_USER.email,
        'wrong-password',
        STORED_USER.tenantId,
      );

      expect(result).toBeNull();
      expect(mockedBcrypt.compare).toHaveBeenCalledWith(
        'wrong-password',
        STORED_USER.passwordHash,
      );
    });

    it('returns the safe user (no passwordHash) on a good password', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...STORED_USER });
      mockedBcrypt.compare.mockResolvedValue(true as never);

      const result = await service.validateUser(
        STORED_USER.email,
        'correct-password',
        STORED_USER.tenantId,
      );

      expect(result).not.toBeNull();
      expect(result).toMatchObject({
        id: STORED_USER.id,
        tenantId: STORED_USER.tenantId,
        email: STORED_USER.email,
        role: STORED_USER.role,
      });
      // passwordHash must never leak out of the service.
      expect((result as Record<string, unknown>).passwordHash).toBeUndefined();
    });
  });

  describe('login', () => {
    const safeUser: SafeUser = {
      id: STORED_USER.id,
      tenantId: STORED_USER.tenantId,
      email: STORED_USER.email,
      name: STORED_USER.name,
      role: STORED_USER.role,
      department: STORED_USER.department,
      createdAt: STORED_USER.createdAt,
      updatedAt: STORED_USER.updatedAt,
    };

    it('signs a JWT whose payload contains the tenantId (and sub/email/role)', async () => {
      const result = await service.login(safeUser);

      expect(jwt.sign).toHaveBeenCalledTimes(1);
      const payload = jwt.sign.mock.calls[0][0];
      expect(payload).toMatchObject({
        sub: safeUser.id,
        tenantId: safeUser.tenantId,
        email: safeUser.email,
        role: safeUser.role,
      });
      expect(payload.tenantId).toBe('tenant-1');

      expect(result.access_token).toBe('signed.jwt.token');
      expect(result.user).toEqual({
        id: safeUser.id,
        email: safeUser.email,
        name: safeUser.name,
        role: safeUser.role,
        tenantId: safeUser.tenantId,
      });
      // The returned user view must not carry the passwordHash either.
      expect((result.user as Record<string, unknown>).passwordHash).toBeUndefined();
    });
  });
});
