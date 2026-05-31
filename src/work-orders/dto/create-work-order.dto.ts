import { IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Priority } from '@prisma/client';

export class CreateWorkOrderDto {
  @ApiProperty({ example: 'Repair burst water main on Oak St' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: 'Emergency repair required following alert escalation.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Public Works' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ enum: Priority, default: Priority.MEDIUM })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional({ example: 'John Smith' })
  @IsOptional()
  @IsString()
  assignee?: string;

  @ApiPropertyOptional({ example: 'alert' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ example: 'asset-uuid' })
  @IsOptional()
  @IsString()
  assetId?: string;

  @ApiPropertyOptional({ example: '2024-06-30T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
