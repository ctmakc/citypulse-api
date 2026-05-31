import { DashboardService } from './dashboard.service';
export declare class DashboardController {
    private service;
    constructor(service: DashboardService);
    getSummary(req: any): Promise<{
        assets: number;
        openAlerts: number;
        activeReports: number;
        activeWorkOrders: number;
    }>;
}
