import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Triggers the local (email+password) Passport strategy.
 * Use on POST /auth/login.
 */
@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}
