import { IsOptional, IsEnum, IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AssetType, RiskLevel } from '@prisma/client';

/**
 * Query DTO for GET /assets.
 *
 * Filters (type / riskLevel / district) work in both response modes.
 * Pagination is OPT-IN: omit `limit` => plain array (legacy); pass `limit` =>
 * { data, nextCursor, total } envelope.
 */
export class ListAssetsDto {
  @ApiPropertyOptional({ enum: AssetType })
  @IsOptional()
  @IsEnum(AssetType)
  type?: AssetType;

  @ApiPropertyOptional({ enum: RiskLevel })
  @IsOptional()
  @IsEnum(RiskLevel)
  riskLevel?: RiskLevel;

  @ApiPropertyOptional({ example: 'Downtown' })
  @IsOptional()
  @IsString()
  district?: string;

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
