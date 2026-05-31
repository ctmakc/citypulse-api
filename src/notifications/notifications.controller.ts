import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  /**
   * Trigger a sample email + webhook notification so the flow is demoable.
   * Returns exactly what was (or, in dry-run, would have been) sent.
   */
  @Post('test')
  @ApiOperation({
    summary:
      'Send a sample notification (email + webhook). In dry-run mode the ' +
      'payloads are logged and returned rather than dispatched.',
  })
  test(@Body() body?: { to?: string }) {
    return this.service.sendTest(body?.to);
  }
}
