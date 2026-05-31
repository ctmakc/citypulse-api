import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString() tenantId: string;
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login and receive JWT' })
  async login(@Body() dto: LoginDto) {
    const user = await this.authService.validateUser(dto.tenantId, dto.email, dto.password);
    return this.authService.login(user as any);
  }
}
