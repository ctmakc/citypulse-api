import { PrismaService } from '../prisma/prisma.service';
export declare class TrafficService {
    private prisma;
    constructor(prisma: PrismaService);
    findAll(tenantId: string): any;
}
