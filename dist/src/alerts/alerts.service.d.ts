import { PrismaService } from '../prisma/prisma.service';
export declare class AlertsService {
    private prisma;
    constructor(prisma: PrismaService);
    findAll(tenantId: string): any;
}
