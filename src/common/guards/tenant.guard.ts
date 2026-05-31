import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtPayload } from '../../auth/decorators/current-user.decorator';

/**
 * TenantGuard — multi-tenant isolation enforcer.
 *
 * Ensures the authenticated user's tenantId matches the :tenantId route
 * parameter. SUPER_ADMIN is exempt and can access any tenant.
 *
 * Apply AFTER JwtAuthGuard:
 *
 *   @UseGuards(JwtAuthGuard, TenantGuard)
 *   @Get(':tenantId/assets')
 *   findAll(@Param('tenantId') tenantId: string) { ... }
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ user: JwtPayload; params: Record<string, string> }>();

    const user = request.user;
    if (!user) {
      throw new ForbiddenException('No authenticated user');
    }

    // SUPER_ADMIN can cross tenant boundaries
    if ((user.role as UserRole) === UserRole.SUPER_ADMIN) {
      return true;
    }

    const routeTenantId =
      request.params?.tenantId ?? request.params?.tenant_id;

    if (!routeTenantId) {
      // No :tenantId param in route — guard is a no-op
      return true;
    }

    if (user.tenantId !== routeTenantId) {
      throw new ForbiddenException(
        'Access denied: you do not belong to this tenant',
      );
    }

    return true;
  }
}
