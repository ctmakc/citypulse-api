import { IsString, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatMessageDto {
  @ApiProperty({ example: 'user', enum: ['user', 'model'] })
  @IsString()
  role: 'user' | 'model';

  @ApiProperty({ example: 'What is the current wildfire risk?' })
  @IsString()
  content: string;
}

export class ChatDto {
  @ApiProperty({ example: 'What is the current AQI?' })
  @IsString()
  message: string;

  @ApiPropertyOptional({ type: [ChatMessageDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  history?: ChatMessageDto[];
}
