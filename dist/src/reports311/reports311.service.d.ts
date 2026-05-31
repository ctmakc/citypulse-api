import { PrismaService } from '../prisma/prisma.service';
export declare class Reports311Service {
    private prisma;
    constructor(prisma: PrismaService);
    findAll(tenantId: string): any;
}
