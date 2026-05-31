import { IsOptional, IsEnum, IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReportStatus, Severity } from '@prisma/client';

/**
 * Query DTO for GET /reports311.
 *
 * Pagination is OPT-IN and backward compatible: omit `limit` => plain array
 * (legacy); pass `limit` => { data, nextCursor, total } envelope.
 */
export class ListReports311Dto {
  @ApiPropertyOptional({ enum: ReportStatus })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiPropertyOptional({ example: 'Pothole' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: Severity })
  @IsOptional()
  @IsEnum(Severity)
  severity?: Severity;

  @ApiPropertyOptional({
    description:
      'Page size. When provided, the response becomes a paginated envelope ' +
      '{ data, nextCursor, total }. When omitted, a plain array is returned.',
    example: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Opaque cursor from a previous response nextCursor.',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
