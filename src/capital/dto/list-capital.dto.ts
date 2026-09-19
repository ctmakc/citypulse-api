import { IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Query DTO for GET /capital.
 *
 * Pagination is OPT-IN and backward compatible: omit `limit` => plain array
 * (legacy); pass `limit` => { data, nextCursor, total } envelope.
 *
 * CapitalProject.status / urgency are free-form strings in the schema, so they
 * are exposed as optional string equality filters.
 */
export class ListCapitalDto {
  @ApiPropertyOptional({ example: 'Identified' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'High' })
  @IsOptional()
  @IsString()
  urgency?: string;

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
