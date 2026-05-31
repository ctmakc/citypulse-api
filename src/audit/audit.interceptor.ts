import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const DEFAULT_TENANT = 'meridian-tenant-id';

/**
 * AuditInterceptor
 *
 * Writes an AuditLog row for every mutating request (POST/PATCH/PUT/DELETE) that
 * succeeds. Registered globally via APP_INTERCEPTOR in AppModule.
 *
 * Hard rule: this must NEVER break a request. All DB work happens after the
 * response stream emits, inside a fire-and-forget block wrapped in try/catch.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<any>();
    const method: string = (req?.method || '').toUpperCase();

    // Only audit mutating verbs; everything else passes straight through.
    if (!MUTATING_METHODS.has(method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: (responseBody) => {
          // Fire-and-forget so we never delay or fail the response.
          void this.writeAudit(req, method, responseBody);
        },
        // On error we deliberately do NOT write an audit row (request failed).
      }),
    );
  }

  private async writeAudit(
    req: any,
    method: string,
    responseBody: unknown,
  ): Promise<void> {
    try {
      const user = req?.user;
      const tenantId: string =
        user?.tenantId ||
        (req?.headers?.['x-tenant-id'] as string) ||
        req?.tenantId ||
        DEFAULT_TENANT;

      const actorType = user ? 'user' : 'system';
      const actorId: string | null = user?.userId ?? user?.id ?? null;
      const action = this.actionFromMethod(method);
      const entity = this.entityFromPath(req);
      const entityId = this.resolveEntityId(req, responseBody);
      const payload = this.trimPayload(req?.body);

      await this.prisma.auditLog.create({
        data: {
          tenantId,
          actorType,
          actorId,
          action,
          entity,
          entityId,
          payload: payload as any,
        },
      });
    } catch (err) {
      // Auditing failures are logged but never propagated.
      this.logger.warn(
        `Audit write skipped: ${(err as Error)?.message ?? 'unknown error'}`,
      );
    }
  }

  private actionFromMethod(method: string): string {
    switch (method) {
      case 'POST':
        return 'create';
      case 'PATCH':
      case 'PUT':
        return 'update';
      case 'DELETE':
        return 'delete';
      default:
        return method.toLowerCase();
    }
  }

  /**
   * Derive the entity from the first path segment after /api/v1.
   * e.g. /api/v1/work-orders/123 -> 'work-orders'
   */
  private entityFromPath(req: any): string {
    const raw: string =
      req?.route?.path || req?.originalUrl || req?.url || '';
    // Strip query string.
    const path = raw.split('?')[0];
    const segments = path.split('/').filter(Boolean);
    // Drop a leading 'api' / 'v1' prefix if present.
    const idx = segments.findIndex((s: string) => s === 'v1');
    const after = idx >= 0 ? segments.slice(idx + 1) : segments;
    const first = after[0] ?? 'unknown';
    // Normalize route placeholders like ':id' to a clean token.
    return first.startsWith(':') ? 'unknown' : first;
  }

  /**
   * Prefer the created/updated resource id from the response body, then fall
   * back to a route param (id / :id / first param value).
   */
  private resolveEntityId(req: any, responseBody: unknown): string | null {
    if (responseBody && typeof responseBody === 'object') {
      const id = (responseBody as Record<string, unknown>).id;
      if (typeof id === 'string' || typeof id === 'number') {
        return String(id);
      }
    }
    const params = req?.params ?? {};
    if (params.id != null) return String(params.id);
    const firstParam = Object.values(params)[0];
    return firstParam != null ? String(firstParam) : null;
  }

  /**
   * Trimmed, safe copy of the request body. Never stores a `password` field
   * (at any depth) and caps overall size to avoid unbounded JSON.
   */
  private trimPayload(body: unknown): unknown {
    if (body == null || typeof body !== 'object') return undefined;
    try {
      const sanitized = this.stripSensitive(body);
      const json = JSON.stringify(sanitized);
      if (json.length > 8000) {
        return { _truncated: true, bytes: json.length };
      }
      return sanitized;
    } catch {
      return undefined;
    }
  }

  private stripSensitive(value: unknown, depth = 0): unknown {
    if (depth > 6 || value == null) return value;
    if (Array.isArray(value)) {
      return value.map((v) => this.stripSensitive(v, depth + 1));
    }
    if (typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        if (/^password$/i.test(k) || /password/i.test(k)) {
          continue; // omit any password-like field
        }
        out[k] = this.stripSensitive(v, depth + 1);
      }
      return out;
    }
    return value;
  }
}
