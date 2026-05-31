import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AgentsService } from './agents.service';
import { PrismaService } from '../prisma/prisma.service';

const AGENT_KEYS = [
  'water',
  'fire',
  'traffic',
  'flood',
  'road',
  'air',
  'citizen',
  'grants',
  'emergency',
];

@Injectable()
export class AgentsScheduler {
  private readonly logger = new Logger(AgentsScheduler.name);

  constructor(
    private agentsService: AgentsService,
    private prisma: PrismaService,
  ) {}

  /** Run every 15 minutes */
  @Cron('0 */15 * * * *')
  async refreshAllAgents() {
    this.logger.log('Scheduled agent refresh started');
    const tenants = await this.prisma.tenant.findMany({ select: { id: true } });

    for (const tenant of tenants) {
      for (const agentKey of AGENT_KEYS) {
        try {
          await this.agentsService.runAgent(tenant.id, agentKey);
        } catch (err) {
          this.logger.error(`Failed to run agent '${agentKey}' for tenant ${tenant.id}: ${err}`);
        }
      }
    }

    this.logger.log(`Refreshed ${AGENT_KEYS.length} agents for ${tenants.length} tenant(s)`);
  }
}
