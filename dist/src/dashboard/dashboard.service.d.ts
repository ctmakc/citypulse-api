import { PrismaService } from '../prisma/prisma.service';
export declare class DashboardService {
    private prisma;
    constructor(prisma: PrismaService);
    getSummary(tenantId: string): Promise<{
        assets: number;
        openAlerts: number;
        activeReports: number;
        activeWorkOrders: number;
    }>;
}
