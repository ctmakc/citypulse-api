import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Severity } from '@prisma/client';

export class CreateAlertDto {
  @ApiProperty({ example: 'Water Main Break' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'Infrastructure' })
  @IsString()
  category: string;

  @ApiPropertyOptional({ enum: Severity, default: Severity.LOW })
  @IsOptional()
  @IsEnum(Severity)
  severity?: Severity;

  @ApiPropertyOptional({ example: 'Burst pipe on Oak St between 3rd and 4th Ave.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '123 Oak Street' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ example: 'Public Works' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ example: 'asset-uuid-here' })
  @IsOptional()
  @IsString()
  assetId?: string;

  @ApiPropertyOptional({ example: 'EXT-2024-001' })
  @IsOptional()
  @IsString()
  externalId?: string;
}
