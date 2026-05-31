import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthReport, HealthService } from './health.service';

/**
 * Public health/liveness/readiness endpoints.
 *
 * No `@UseGuards(...)` is applied here on purpose — these routes must be
 * reachable without authentication (load balancers, uptime monitors, k8s
 * probes). This mirrors the codebase convention where public routes simply
 * omit the JWT guard (e.g. `reports311 GET track/:code`).
 *
 * Every endpoint always returns HTTP 200 quickly; dependency trouble is encoded
 * in the response body (`status: 'degraded'`, `checks.*: 'down'`), never as a
 * hang or a 5xx.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Health check (public) — db + redis dependency probes' })
  check(): Promise<HealthReport> {
    return this.health.check();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe (public) — alias of /health' })
  ready(): Promise<HealthReport> {
    return this.health.check();
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe (public) — alias of /health' })
  live(): Promise<HealthReport> {
    return this.health.check();
  }
}
