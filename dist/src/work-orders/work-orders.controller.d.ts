import { WorkOrdersService } from './work-orders.service';
export declare class WorkOrdersController {
    private service;
    constructor(service: WorkOrdersService);
    findAll(req: any): any;
}
