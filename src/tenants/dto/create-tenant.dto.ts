import { IsString, IsOptional, IsInt, IsEnum, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TenantType } from '@prisma/client';

export class CreateTenantDto {
  @ApiProperty({ example: 'City of Meridian' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ enum: TenantType, default: TenantType.CITY })
  @IsOptional()
  @IsEnum(TenantType)
  type?: TenantType;

  @ApiPropertyOptional({ example: 'CA' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 'America/Vancouver' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 341200 })
  @IsOptional()
  @IsInt()
  @Min(0)
  population?: number;

  @ApiPropertyOptional({ example: 62, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  riskScore?: number;

  @ApiPropertyOptional({ example: 'Elevated' })
  @IsOptional()
  @IsString()
  riskLabel?: string;
}
