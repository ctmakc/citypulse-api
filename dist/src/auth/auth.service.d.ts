import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
export declare class AuthService {
    private prisma;
    private jwt;
    constructor(prisma: PrismaService, jwt: JwtService);
    validateUser(tenantId: string, email: string, password: string): Promise<{
        id: string;
        tenantId: string;
        email: string;
        name: string;
        role: import("@prisma/client").$Enums.UserRole;
        department: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    login(user: {
        id: string;
        tenantId: string;
        email: string;
        role: string;
    }): Promise<{
        access_token: string;
        user: {
            id: string;
            tenantId: string;
            email: string;
            role: string;
        };
    }>;
}
