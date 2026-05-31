import {
  Controller,
  Get,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuditService } from './audit.service';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List recent audit-trail entries for the tenant' })
  @ApiQuery({ name: 'entity', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(
    @Request() req: any,
    @Query('entity') entity?: string,
    @Query('limit') limit?: string,
  ) {
    const tenantId =
      req.user?.tenantId || req.tenantId || 'meridian-tenant-id';
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    return this.audit.list(tenantId, {
      entity,
      limit: Number.isNaN(parsedLimit as number) ? undefined : parsedLimit,
    });
  }
}
