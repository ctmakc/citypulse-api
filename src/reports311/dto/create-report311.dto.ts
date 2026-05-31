import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsUrl,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Severity } from '@prisma/client';

export const REPORT_CATEGORIES = [
  'Flooding',
  'Water leak',
  'Pothole',
  'Road ice',
  'Damaged sign',
  'Streetlight out',
  'Fallen tree',
  'Illegal dumping',
  'Pollution',
  'Noise',
  'Other',
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export class CreateReport311Dto {
  @ApiProperty({ description: 'Tenant ID (required for public submissions)' })
  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @ApiProperty({ enum: REPORT_CATEGORIES, description: 'Issue category' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ enum: Severity, default: Severity.LOW })
  @IsOptional()
  @IsEnum(Severity)
  severity?: Severity;

  @ApiProperty({ description: 'Human-readable location or address' })
  @IsString()
  @IsNotEmpty()
  location: string;

  @ApiPropertyOptional({ description: 'Latitude', example: 45.4215 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  locationLat?: number;

  @ApiPropertyOptional({ description: 'Longitude', example: -75.6972 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  locationLng?: number;

  @ApiPropertyOptional({ description: 'Detailed description of the issue' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'URL of an attached photo' })
  @IsOptional()
  @IsUrl()
  photoUrl?: string;

  @ApiPropertyOptional({ description: 'Submitter email for status updates' })
  @IsOptional()
  @IsEmail()
  submitterEmail?: string;
}
