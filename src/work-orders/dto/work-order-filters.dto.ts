import { IsOptional, IsEnum, IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Priority, WorkOrderStatus } from '@prisma/client';

export class WorkOrderFiltersDto {
  @ApiPropertyOptional({ enum: WorkOrderStatus })
  @IsOptional()
  @IsEnum(WorkOrderStatus)
  status?: WorkOrderStatus;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional({ example: 'Public Works' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ example: 'John Smith' })
  @IsOptional()
  @IsString()
  assignee?: string;

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
