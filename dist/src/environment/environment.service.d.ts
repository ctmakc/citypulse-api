import { PrismaService } from '../prisma/prisma.service';
export declare class EnvironmentService {
    private prisma;
    constructor(prisma: PrismaService);
    findAll(tenantId: string): any;
}
