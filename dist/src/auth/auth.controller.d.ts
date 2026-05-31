import { AuthService } from './auth.service';
export declare class LoginDto {
    tenantId: string;
    email: string;
    password: string;
}
export declare class AuthController {
    private authService;
    constructor(authService: AuthService);
    login(dto: LoginDto): Promise<{
        access_token: string;
        user: {
            id: string;
            tenantId: string;
            email: string;
            role: string;
        };
    }>;
}
