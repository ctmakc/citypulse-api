import { PrismaService } from '../prisma/prisma.service';
export declare class WorkOrdersService {
    private prisma;
    constructor(prisma: PrismaService);
    findAll(tenantId: string): any;
}
