import { IsOptional, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Bounding-box query (n/s/e/w as WGS84 degrees) shared by /assets/within and
 * /assets/clusters. All four corners are validated as finite degrees so they can
 * be safely interpolated into parameterized PostGIS SQL ($queryRaw / Prisma.sql).
 */
export class BboxQueryDto {
  @ApiProperty({ description: 'North latitude (max lat)', example: 47.64 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  n!: number;

  @ApiProperty({ description: 'South latitude (min lat)', example: 47.55 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  s!: number;

  @ApiProperty({ description: 'East longitude (max lng)', example: -122.25 })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  e!: number;

  @ApiProperty({ description: 'West longitude (min lng)', example: -122.41 })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  w!: number;
}

/** GET /assets/within — bbox + a row cap for map rendering. */
export class WithinQueryDto extends BboxQueryDto {
  @ApiPropertyOptional({
    description: 'Max rows to return (clamped 1..10000). Default 2000.',
    example: 2000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(10000)
  limit?: number;
}

/** GET /assets/near — point + radius (meters). */
export class NearQueryDto {
  @ApiProperty({ description: 'Center latitude (WGS84)', example: 47.6062 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ description: 'Center longitude (WGS84)', example: -122.3321 })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @ApiPropertyOptional({
    description: 'Search radius in meters (clamped 1..50000). Default 500.',
    example: 500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50000)
  radius?: number;

  @ApiPropertyOptional({
    description: 'Max rows to return (clamped 1..10000). Default 1000.',
    example: 1000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(10000)
  limit?: number;
}

/** GET /assets/clusters — bbox + grid cell size (degrees) for low-zoom rendering. */
export class ClustersQueryDto extends BboxQueryDto {
  @ApiPropertyOptional({
    description:
      'Grid cell size in degrees for ST_SnapToGrid (clamped 0.0001..1). ' +
      'Smaller = more, tighter clusters. Default 0.01 (~1km).',
    example: 0.01,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  @Max(1)
  grid?: number;
}
