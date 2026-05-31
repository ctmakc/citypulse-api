import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatMessageDto } from './dto/chat.dto';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentStatus {
  key: string;
  name: string;
  ico: string;
  color: string;
  status: 'Action required' | 'Monitoring' | 'Watch' | 'Standby' | 'Opportunity';
  esc: 'Critical' | 'Elevated' | 'Watch' | 'Info';
  conf: number;
  dept: string;
  sources: string[];
  finding: string;
  actions: string[];
}

export interface Briefing {
  generatedAt: Date;
  riskLevel: string;
  headline: string;
  highlights: string[];
  agents: AgentStatus[];
  criticalCount: number;
  elevatedCount: number;
}

export interface AgentRun {
  id: string;
  tenantId: string;
  agentKey: string;
  status: string;
  finding: string | null;
  confidence: number | null;
  escalation: string | null;
  actions: unknown;
  runAt: Date;
}

// ─── Static agent definitions (design baseline) ──────────────────────────────

const STATIC_AGENTS: AgentStatus[] = [
  {
    key: 'water',
    name: 'WaterGuard AI',
    ico: '💧',
    color: 'blue',
    status: 'Action required',
    esc: 'Critical',
    conf: 0.94,
    dept: 'Public Works',
    sources: ['SCADA', 'Pressure Sensors', 'Flow Meters', 'Quality Labs'],
    finding:
      'Pressure anomaly detected on Maple Ave main (Zone 4). Readings 12 PSI below baseline for 3 hours. Possible micro-fracture or valve failure. 847 residents at risk.',
    actions: [
      'Dispatch crew to Maple Ave & 3rd St',
      'Isolate Zone 4 valve cluster',
      'Notify affected residents via 311',
    ],
  },
  {
    key: 'fire',
    name: 'FireWatch AI',
    ico: '🔥',
    color: 'orange',
    status: 'Action required',
    esc: 'Elevated',
    conf: 0.88,
    dept: 'Emergency Management',
    sources: ['Weather API', 'Satellite', 'IoT Fire Sensors', 'USFS Data'],
    finding:
      'NE Ridge corridor shows elevated wildfire risk. Wind speed 34 km/h NE, humidity 18%, dry fuel load HIGH. Two ignition points reported near km 14 trail access.',
    actions: [
      'Pre-position Engine 7 at NE Ridge station',
      'Issue advisory for zones R-4 through R-7',
      'Coordinate with BC Wildfire Service',
    ],
  },
  {
    key: 'traffic',
    name: 'TrafficFlow AI',
    ico: '🚦',
    color: 'yellow',
    status: 'Watch',
    esc: 'Watch',
    conf: 0.79,
    dept: 'Transportation',
    sources: ['Signal Controllers', 'Loop Detectors', 'GPS Feed', 'Incident Reports'],
    finding:
      'Downtown core showing 23% above-baseline congestion. Main × 5th Ave intersection failure causing cascade. Estimated 340 vehicles affected, 18-min delay.',
    actions: [
      'Deploy traffic control officer to Main × 5th',
      'Activate alternate route signage (Route B)',
      'Extend green cycles on Oak St corridor',
    ],
  },
  {
    key: 'flood',
    name: 'FloodSense AI',
    ico: '🌊',
    color: 'cyan',
    status: 'Monitoring',
    esc: 'Watch',
    conf: 0.82,
    dept: 'Public Works',
    sources: ['Rain Gauges', 'Stream Gauges', 'Stormwater SCADA', 'Weather Forecast'],
    finding:
      'Cedar Creek at 78% channel capacity following 28mm overnight rainfall. Basin saturation high. 72-hr forecast shows additional 45mm — threshold for downstream overbank is 95%.',
    actions: [
      'Monitor Cedar Creek gauge Q4-hour intervals',
      'Pre-stage sandbag deployment teams',
      'Alert downstream properties if 85% threshold reached',
    ],
  },
  {
    key: 'road',
    name: 'RoadScan AI',
    ico: '🛣️',
    color: 'gray',
    status: 'Watch',
    esc: 'Elevated',
    conf: 0.91,
    dept: 'Public Works',
    sources: ['Pothole Reports', 'Asset DB', '311 Reports', 'Pavement Sensors'],
    finding:
      '14 new pothole clusters reported in District 3 post-freeze-thaw cycle. Hwy 7 bridge deck showing surface delamination — inspected 11 months ago. 3 work orders past SLA.',
    actions: [
      'Schedule Hwy 7 bridge re-inspection (48 hr)',
      'Assign District 3 patch crew for priority clusters',
      'Review 3 overdue work orders with supervisor',
    ],
  },
  {
    key: 'air',
    name: 'AirSense AI',
    ico: '🌫️',
    color: 'purple',
    status: 'Watch',
    esc: 'Watch',
    conf: 0.86,
    dept: 'Environment',
    sources: ['AQI Stations', 'Provincial Feed', 'Wind Models', 'Satellite AOD'],
    finding:
      'AQI reached 84 (Moderate) at noon peak — elevated PM2.5 (28 µg/m³) from NE wildfire smoke transport. Sensitive groups advised indoors. Trend improving post-18:00.',
    actions: [
      'Issue public advisory for sensitive groups',
      'Notify school board for outdoor activity limits',
      'Continue hourly AQI monitoring',
    ],
  },
  {
    key: 'citizen',
    name: 'CitizenPulse AI',
    ico: '👥',
    color: 'green',
    status: 'Monitoring',
    esc: 'Info',
    conf: 0.73,
    dept: 'Citizen Services',
    sources: ['311 Reports', 'Social Media', 'Survey Data', 'Permit Requests'],
    finding:
      '47 new 311 reports in 24h. Top category: road surface (31%), water (26%), parks (18%). Sentiment neutral-negative. 3 cluster patterns suggest unreported infrastructure issues in Ward 6.',
    actions: [
      'Route 14 water-related reports to Public Works',
      'Investigate Ward 6 cluster (possible unreported main break)',
      'Schedule Park maintenance review for Q3',
    ],
  },
  {
    key: 'grants',
    name: 'GrantRadar AI',
    ico: '💰',
    color: 'emerald',
    status: 'Opportunity',
    esc: 'Info',
    conf: 0.95,
    dept: 'Finance',
    sources: ['Federal DB', 'Provincial Grants', 'Infrastructure Canada', 'Climate Fund'],
    finding:
      'Infrastructure Canada Green Transit Fund — $2.4M opportunity identified. Application window closes in 31 days. City qualifies on 7 of 8 criteria. EV charging + bus electrification projects eligible.',
    actions: [
      'Assign grant writer to Infrastructure Canada file',
      'Compile supporting data from Transit dept',
      'Submit Letter of Intent by Friday',
    ],
  },
  {
    key: 'emergency',
    name: 'EmergencyCoord AI',
    ico: '🚨',
    color: 'red',
    status: 'Standby',
    esc: 'Info',
    conf: 0.97,
    dept: 'Emergency Management',
    sources: ['EOC Feed', 'RCMP Liaison', 'EMS CAD', 'BC Hydro Outages'],
    finding:
      'No active emergency declarations. 2 units on precautionary standby (NE wildfire corridor). All EMS response times within SLA. EOC fully staffed. Mass notification system tested OK.',
    actions: [
      'Maintain wildfire standby posture until wind advisory lifts',
      'Confirm NE Ridge resource pre-positioning',
    ],
  },
];

// ─── Keyword-based fallback chat responses ───────────────────────────────────

const FALLBACK_RESPONSES: { keywords: string[]; response: string }[] = [
  {
    keywords: ['wildfire', 'fire', 'smoke', 'burn'],
    response:
      'Wildfire risk is currently HIGH on the NE Ridge corridor. Wind speeds are 34 km/h with humidity at 18%. Engine 7 is pre-positioned and an advisory covers zones R-4 through R-7. Monitor FireWatch AI for updates.',
  },
  {
    keywords: ['aqi', 'air', 'quality', 'pollution', 'pm2.5'],
    response:
      'Current AQI is 84 (Moderate) with elevated PM2.5 at 28 µg/m³ due to wildfire smoke transport from the NE. Sensitive groups should stay indoors. The trend is improving after 18:00.',
  },
  {
    keywords: ['water', 'pressure', 'main', 'leak', 'pipe'],
    response:
      'WaterGuard AI has flagged a pressure anomaly on Maple Ave (Zone 4) — 12 PSI below baseline for 3 hours. A crew has been dispatched and 847 residents may be affected. Zone 4 valve isolation is underway.',
  },
  {
    keywords: ['flood', 'rain', 'creek', 'storm', 'drainage'],
    response:
      'Cedar Creek is at 78% channel capacity after 28mm overnight rainfall. A 72-hour forecast adds 45mm more. Sandbag teams are on standby and monitoring continues every 4 hours.',
  },
  {
    keywords: ['traffic', 'congestion', 'road', 'pothole', 'bridge'],
    response:
      'Downtown congestion is 23% above baseline due to a signal failure at Main × 5th Ave. A traffic control officer is en route. Road scan also flagged 14 pothole clusters in District 3 and delamination on the Hwy 7 bridge deck.',
  },
  {
    keywords: ['grant', 'fund', 'funding', 'money', 'eligible'],
    response:
      'GrantRadar AI found a $2.4M Infrastructure Canada Green Transit Fund opportunity closing in 31 days. The city meets 7 of 8 criteria. Assign a grant writer and submit a Letter of Intent by Friday.',
  },
  {
    keywords: ['emergency', 'eoc', 'ems', 'dispatch'],
    response:
      'No active emergency declarations. Two units are on precautionary standby for the NE wildfire corridor. All EMS response times are within SLA and the EOC is fully staffed.',
  },
  {
    keywords: ['agent', 'agents', 'status', 'briefing', 'overview'],
    response:
      'There are 9 active AI agents: WaterGuard (Critical), FireWatch (Elevated), TrafficFlow and RoadScan (Watch), FloodSense and AirSense (Watch/monitoring), CitizenPulse and GrantRadar (Info/opportunity), and EmergencyCoord (Standby). Two agents require immediate action.',
  },
];

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(private prisma: PrismaService) {}

  // ── getAllAgents ────────────────────────────────────────────────────────────

  async getAllAgents(tenantId: string): Promise<AgentStatus[]> {
    // Fetch the most recent run per agent key
    const runs = await this.prisma.agentRun.findMany({
      where: { tenantId },
      orderBy: { runAt: 'desc' },
    });

    const latestByKey = new Map<string, typeof runs[number]>();
    for (const run of runs) {
      if (!latestByKey.has(run.agentKey)) {
        latestByKey.set(run.agentKey, run);
      }
    }

    return STATIC_AGENTS.map((agent) => {
      const run = latestByKey.get(agent.key);
      if (!run) return agent;

      return {
        ...agent,
        status: (run.status as AgentStatus['status']) ?? agent.status,
        esc: (run.escalation as AgentStatus['esc']) ?? agent.esc,
        conf: run.confidence ?? agent.conf,
        finding: run.finding ?? agent.finding,
        actions: Array.isArray(run.actions) ? (run.actions as string[]) : agent.actions,
      };
    });
  }

  // ── getMorningBriefing ──────────────────────────────────────────────────────

  async getMorningBriefing(tenantId: string): Promise<Briefing> {
    const agents = await this.getAllAgents(tenantId);

    const criticalCount = agents.filter((a) => a.esc === 'Critical').length;
    const elevatedCount = agents.filter((a) => a.esc === 'Elevated').length;
    const actionCount = agents.filter((a) => a.status === 'Action required').length;

    let riskLevel = 'Normal';
    if (criticalCount > 0) riskLevel = 'Critical';
    else if (elevatedCount > 0) riskLevel = 'Elevated';
    else if (agents.some((a) => a.esc === 'Watch')) riskLevel = 'Watch';

    const highlights = agents
      .filter((a) => a.esc === 'Critical' || a.esc === 'Elevated')
      .map((a) => `[${a.esc}] ${a.name}: ${a.finding.slice(0, 120)}…`);

    return {
      generatedAt: new Date(),
      riskLevel,
      headline: `${actionCount} agent${actionCount !== 1 ? 's' : ''} require immediate action. Overall city risk: ${riskLevel}.`,
      highlights,
      agents,
      criticalCount,
      elevatedCount,
    };
  }

  // ── runAgent ────────────────────────────────────────────────────────────────

  async runAgent(tenantId: string, agentKey: string): Promise<AgentRun> {
    const staticAgent = STATIC_AGENTS.find((a) => a.key === agentKey);
    if (!staticAgent) {
      throw new NotFoundException(`Agent '${agentKey}' not found`);
    }

    // Simulate a realistic analysis run with slight confidence jitter
    const jitter = (Math.random() - 0.5) * 0.04;
    const confidence = Math.min(1, Math.max(0, staticAgent.conf + jitter));

    const run = await this.prisma.agentRun.create({
      data: {
        tenantId,
        agentKey,
        status: staticAgent.status,
        finding: staticAgent.finding,
        confidence: parseFloat(confidence.toFixed(3)),
        escalation: staticAgent.esc,
        actions: staticAgent.actions,
      },
    });

    return run as AgentRun;
  }

  // ── chat ───────────────────────────────────────────────────────────────────

  async chat(
    tenantId: string,
    message: string,
    history: ChatMessageDto[],
  ): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        return await this.callGemini(apiKey, message, history);
      } catch (err) {
        this.logger.warn(`Gemini API error — falling back to scripted response: ${err}`);
      }
    }

    return this.scriptedResponse(message);
  }

  // ── Private: Gemini call ───────────────────────────────────────────────────

  private async callGemini(
    apiKey: string,
    message: string,
    history: ChatMessageDto[],
  ): Promise<string> {
    const SYSTEM_PROMPT =
      "You are Meridian's AI assistant for the CityPulse civic infrastructure platform. " +
      'You have access to: 9 AI agents, 8 infrastructure assets, 5 active alerts, ' +
      'current AQI 84, wildfire risk HIGH on NE Ridge. Answer concisely in 2-4 sentences.';

    // Build contents array (Gemini format)
    const contents: { role: string; parts: { text: string }[] }[] = [];

    // Inject system prompt as first user turn if no history
    if (history.length === 0) {
      contents.push({ role: 'user', parts: [{ text: SYSTEM_PROMPT }] });
      contents.push({ role: 'model', parts: [{ text: 'Understood. How can I help you with CityPulse today?' }] });
    }

    for (const h of history) {
      contents.push({ role: h.role, parts: [{ text: h.content }] });
    }
    contents.push({ role: 'user', parts: [{ text: message }] });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const body = JSON.stringify({
      contents,
      generationConfig: {
        maxOutputTokens: 256,
        temperature: 0.4,
      },
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini HTTP ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty Gemini response');
    return text.trim();
  }

  // ── Private: scripted fallback ─────────────────────────────────────────────

  private getScriptedResponse(message: string): string {
    const msg = message.toLowerCase();
    if (msg.includes('overnight') || msg.includes('changed'))
      return 'Overnight changes: MX-118 corrosivity index rose 7.4→8.1 (failure risk now within 90 days). Wildfire zone expanded ~340m toward Northgate. 23 new 311 reports (9 cluster in Westbank). AQI rose 9 points to 84 near south corridor schools.';
    if (msg.includes('decision') || msg.includes('today') || msg.includes('attention'))
      return 'Three decisions need your attention today: (1) Authorize MX-118 emergency inspection — Water Authority is waiting; (2) Approve NE Ridge crew pre-staging — Fire & Rescue needs sign-off; (3) Confirm Westbank drainage work order before Tuesday\'s storm.';
    if (msg.includes('water') || msg.includes('main') || msg.includes('mx-118'))
      return 'MX-118 shows corrosivity index 8.1 (critical threshold: 7.0). Acoustic sensors detected pre-failure transients at two joints. Failure probability: 82% within 90 days. Recommended action: emergency inspection ($40K) vs reactive repair ($2.1M).';
    if (msg.includes('council') || msg.includes('briefing') || msg.includes('draft'))
      return 'Good morning. Our AI monitoring system flags two critical risks: (1) Water main MX-118 failure predicted within 90 days — recommend authorizing $40K emergency inspection to avoid $2.1M reactive repair; (2) Wildfire risk HIGH on NE Ridge with 430 homes in the 2-hour spread band — crew pre-staging recommended immediately.';
    if (msg.includes('wildfire') || msg.includes('fire') || msg.includes('ridge'))
      return 'NE Ridge wildfire risk is HIGH. The ignition zone expanded ~340m after a wind shift. 430 Northgate homes are within the 2-hour spread band. Fuel moisture at 9% (critical). 18 of 24 crews available. Immediate actions: issue resident advisory, pre-position crews at NE staging.';
    return '';
  }

  private scriptedResponse(message: string): string {
    // Try the more specific scripted responses first
    const specific = this.getScriptedResponse(message);
    if (specific) return specific;

    const lower = message.toLowerCase();

    for (const entry of FALLBACK_RESPONSES) {
      if (entry.keywords.some((kw) => lower.includes(kw))) {
        return entry.response;
      }
    }

    return (
      'I have analyzed the current city data. Risk is elevated in two areas: water infrastructure (MX-118 failure risk) and NE Ridge wildfire zone. Both require immediate attention. What would you like to know more about?'
    );
  }
}
