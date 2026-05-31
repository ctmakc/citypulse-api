import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async validateUser(tenantId: string, email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email } },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    const { passwordHash: _ph, ...result } = user;
    return result;
  }

  async login(user: { id: string; tenantId: string; email: string; role: string }) {
    const payload = { sub: user.id, tenantId: user.tenantId, email: user.email, role: user.role };
    return { access_token: this.jwt.sign(payload), user };
  }
}
