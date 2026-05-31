import { PrismaService } from '../prisma/prisma.service';
export declare class TenantsService {
    private prisma;
    constructor(prisma: PrismaService);
    findAll(tenantId: string): any;
}
