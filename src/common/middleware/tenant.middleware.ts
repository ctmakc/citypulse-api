import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request & { tenantId?: string }, res: Response, next: NextFunction) {
    // Tenant from JWT (set by JwtStrategy) or from header
    req.tenantId = (req as any)['user']?.tenantId || req.headers['x-tenant-id'] as string || 'meridian-tenant-id';
    next();
  }
}
