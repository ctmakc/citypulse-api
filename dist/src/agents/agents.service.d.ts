import { PrismaService } from '../prisma/prisma.service';
export declare class AgentsService {
    private prisma;
    constructor(prisma: PrismaService);
    findAll(tenantId: string): any;
}
