import { PrismaService } from '../prisma/prisma.service';
export declare class AssetsService {
    private prisma;
    constructor(prisma: PrismaService);
    findAll(tenantId: string): any;
}
