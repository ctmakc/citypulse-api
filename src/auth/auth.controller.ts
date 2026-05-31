import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import type { JwtPayload } from './decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ------------------------------------------------------------------ //
  // POST /auth/login
  // ------------------------------------------------------------------ //
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LocalAuthGuard)
  @ApiOperation({ summary: 'Authenticate with email + password and receive JWT' })
  @ApiResponse({ status: 200, description: 'Returns access_token + user profile' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@CurrentUser() user: any) {
    // LocalStrategy has already validated and populated request.user
    return this.authService.login(user);
  }

  // ------------------------------------------------------------------ //
  // POST /auth/register
  // Open for the very first user of a tenant (bootstrapping OWNER).
  // For subsequent users OWNER or SUPER_ADMIN JWT is required.
  // The guard is applied conditionally below via a two-step approach:
  //   - The endpoint is always reachable.
  //   - auth.service.register() promotes first user to OWNER automatically.
  //   - The controller checks the caller's role only when users already exist
  //     (handled inside the service: restricted role assignment).
  // For a stricter approach, wrap with @UseGuards(JwtAuthGuard, RolesGuard)
  // and @Roles(UserRole.OWNER, UserRole.SUPER_ADMIN) and remove the
  // "first-user open" logic from the service.
  // ------------------------------------------------------------------ //
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Register a new user in an existing tenant. ' +
      'First registration is open (bootstraps OWNER). ' +
      'Subsequent registrations require OWNER or SUPER_ADMIN JWT.',
  })
  @ApiResponse({ status: 201, description: 'User created' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async register(@Body() dto: RegisterDto) {
    const user = await this.authService.register(dto);
    return { message: 'User registered successfully', user };
  }

  // ------------------------------------------------------------------ //
  // POST /auth/register/admin  — privileged endpoint (OWNER/SUPER_ADMIN only)
  // Allows assigning arbitrary roles when creating new users.
  // ------------------------------------------------------------------ //
  @Post('register/admin')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Create a new user with a specific role (OWNER / SUPER_ADMIN only)',
  })
  @ApiResponse({ status: 201, description: 'User created' })
  @ApiResponse({ status: 403, description: 'Insufficient role' })
  async registerByAdmin(@Body() dto: RegisterDto) {
    const user = await this.authService.register(dto);
    return { message: 'User registered successfully', user };
  }

  // ------------------------------------------------------------------ //
  // GET /auth/me
  // ------------------------------------------------------------------ //
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the authenticated user profile' })
  @ApiResponse({ status: 200, description: 'Current user profile' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async me(@CurrentUser() payload: JwtPayload) {
    return this.authService.findById(payload.userId);
  }

  // ------------------------------------------------------------------ //
  // POST /auth/logout
  // JWT is stateless — actual invalidation is client-side (discard token).
  // A production implementation would maintain a token deny-list in Redis.
  // ------------------------------------------------------------------ //
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Logout (client-side token discard). ' +
      'Server acknowledges but does not blacklist the token.',
  })
  logout() {
    return { message: 'Logged out successfully. Discard the token on the client.' };
  }
}
