import { PrismaService } from '../prisma/prisma.service';
export declare class CapitalService {
    private prisma;
    constructor(prisma: PrismaService);
    findAll(tenantId: string): any;
}
