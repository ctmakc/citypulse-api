import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AgentsService } from './agents.service';
import { ChatDto } from './dto/chat.dto';

@ApiTags('agents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('agents')
export class AgentsController {
  constructor(private readonly service: AgentsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all agent statuses for the tenant' })
  getAllAgents(@Request() req: any) {
    return this.service.getAllAgents(req.user.tenantId);
  }

  @Get('briefing')
  @ApiOperation({ summary: 'Get the morning briefing for the tenant' })
  getMorningBriefing(@Request() req: any) {
    return this.service.getMorningBriefing(req.user.tenantId);
  }

  @Post(':key/run')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Trigger a specific agent run and persist result' })
  @ApiParam({ name: 'key', description: 'Agent key (e.g. water, fire, traffic…)' })
  runAgent(@Request() req: any, @Param('key') key: string) {
    return this.service.runAgent(req.user.tenantId, key);
  }

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Chat with the AI assistant (Gemini or scripted fallback)' })
  async chat(@Request() req: any, @Body() dto: ChatDto) {
    const reply = await this.service.chat(
      req.user.tenantId,
      dto.message,
      dto.history ?? [],
    );
    return { reply };
  }
}
