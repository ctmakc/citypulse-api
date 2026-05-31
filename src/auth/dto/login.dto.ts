import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@cityname.gov' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'securepassword', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;
}
