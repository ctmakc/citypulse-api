import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';

const BCRYPT_ROUNDS = 12;

export type SafeUser = {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
  department: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Validate email + password for a given tenant.
   * Returns the safe user (no passwordHash) or null.
   */
  async validateUser(
    email: string,
    password: string,
    tenantId: string,
  ): Promise<SafeUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email } },
    });

    if (!user) return null;

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return null;

    const { passwordHash: _ph, ...safe } = user;
    return safe as SafeUser;
  }

  /**
   * Validate email + password globally (no tenantId required).
   * Looks up the user by email across all tenants. If multiple accounts share
   * the same email address the first match wins (demo-safe; production would
   * require tenant disambiguation).
   */
  async validateUserByEmail(
    email: string,
    password: string,
  ): Promise<SafeUser | null> {
    const user = await this.prisma.user.findFirst({
      where: { email },
    });

    if (!user) return null;

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return null;

    const { passwordHash: _ph, ...safe } = user;
    return safe as SafeUser;
  }

  /**
   * Issue a signed JWT for a validated user.
   */
  async login(user: SafeUser): Promise<{
    access_token: string;
    user: Pick<SafeUser, 'id' | 'email' | 'name' | 'role' | 'tenantId'>;
  }> {
    const payload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  /**
   * Register a new user inside an existing tenant.
   *
   * Rules:
   * - The tenant must exist.
   * - If no users exist for the tenant yet, the first registration is open
   *   (bootstrapping the OWNER account).
   * - Subsequent registrations require the caller to supply a valid OWNER/
   *   SUPER_ADMIN JWT (enforced at the controller layer).
   * - Duplicate email within the same tenant is rejected.
   */
  async register(dto: RegisterDto): Promise<SafeUser> {
    // Verify tenant exists
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant '${dto.tenantId}' not found`);
    }

    // Duplicate check
    const existing = await this.prisma.user.findUnique({
      where: {
        tenantId_email: { tenantId: dto.tenantId, email: dto.email },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Email '${dto.email}' is already registered in this tenant`,
      );
    }

    if (!dto.password || dto.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // First user in tenant → promote to OWNER automatically
    const userCount = await this.prisma.user.count({
      where: { tenantId: dto.tenantId },
    });
    const role: UserRole =
      userCount === 0
        ? UserRole.OWNER
        : (dto.role ?? UserRole.READ_ONLY);

    const created = await this.prisma.user.create({
      data: {
        tenantId: dto.tenantId,
        email: dto.email,
        name: dto.name,
        role,
        department: dto.department ?? null,
        passwordHash,
      },
    });

    const { passwordHash: _ph, ...safe } = created;
    return safe as SafeUser;
  }

  /**
   * Fetch a user by ID for /auth/me.
   */
  async findById(userId: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    const { passwordHash: _ph, ...safe } = user;
    return safe as SafeUser;
  }
}
