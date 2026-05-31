import { IsString, IsOptional, IsNumber, IsDateString, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCapitalProjectDto {
  @ApiPropertyOptional({ example: 'Updated Project Title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 5000000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  urgency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  grantProgram?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  grantEligibility?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  grantMatch?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  climateScore?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  safetyScore?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  equityScore?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  readiness?: string;

  @ApiPropertyOptional({ example: '2024-12-31T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  deadline?: string;

  @ApiPropertyOptional({ example: 0.9, minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  probability?: number;

  @ApiPropertyOptional({ example: 'Approved' })
  @IsOptional()
  @IsString()
  status?: string;
}
