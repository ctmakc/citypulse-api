import { IsString, IsOptional, IsNumber, IsDateString, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCapitalProjectDto {
  @ApiProperty({ example: 'Oak Street Bridge Rehabilitation' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: 'Full deck replacement and structural reinforcement.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 4200000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @ApiPropertyOptional({ example: 'Critical' })
  @IsOptional()
  @IsString()
  urgency?: string;

  @ApiPropertyOptional({ example: 'ICIP' })
  @IsOptional()
  @IsString()
  grantProgram?: string;

  @ApiPropertyOptional({ example: 'Eligible' })
  @IsOptional()
  @IsString()
  grantEligibility?: string;

  @ApiPropertyOptional({ example: '40%' })
  @IsOptional()
  @IsString()
  grantMatch?: string;

  @ApiPropertyOptional({ example: 'High' })
  @IsOptional()
  @IsString()
  climateScore?: string;

  @ApiPropertyOptional({ example: 'Critical' })
  @IsOptional()
  @IsString()
  safetyScore?: string;

  @ApiPropertyOptional({ example: 'Medium' })
  @IsOptional()
  @IsString()
  equityScore?: string;

  @ApiPropertyOptional({ example: 'Shovel-ready' })
  @IsOptional()
  @IsString()
  readiness?: string;

  @ApiPropertyOptional({ example: '2024-09-30T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  deadline?: string;

  @ApiPropertyOptional({ example: 0.82, minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  probability?: number;

  @ApiPropertyOptional({ example: 'In Planning' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'EXT-CAP-001' })
  @IsOptional()
  @IsString()
  externalId?: string;
}
