import { UsersService } from './users.service';
export declare class UsersController {
    private service;
    constructor(service: UsersService);
    findAll(req: any): any;
}
