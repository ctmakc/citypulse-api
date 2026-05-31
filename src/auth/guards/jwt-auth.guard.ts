import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Protects routes with JWT Bearer token validation.
 * Attaches the decoded payload to request.user.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
