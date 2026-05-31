import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, RiskLevel, Severity } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChatMessageDto } from './dto/chat.dto';

// ─── Types ────────────────────────────────────────────────────────────────────

type Escalation = 'Critical' | 'Elevated' | 'Watch' | 'Info';
type AgentRunStatus =
  | 'Action required'
  | 'Monitoring'
  | 'Watch'
  | 'Standby'
  | 'Opportunity';

export interface AgentStatus {
  key: string;
  name: string;
  ico: string;
  color: string;
  status: AgentRunStatus;
  esc: Escalation;
  conf: number;
  dept: string;
  sources: string[];
  finding: string;
  actions: string[];
}

/** What every per-agent `analyze*` function returns — all derived from live rows. */
export interface AnalysisResult {
  finding: string;
  confidence: number; // 0..1
  escalation: Escalation;
  status: AgentRunStatus;
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
  // Data-driven sections
  topRisks: BriefingRisk[];
  overnight: string[];
  attention: string[];
  expensive: ExpensiveItem[];
}

export interface BriefingRisk {
  ref: string;
  label: string;
  detail: string;
  escalation: Escalation;
}

export interface ExpensiveItem {
  title: string;
  plannedCost: number;
  reactiveCost: number;
  gap: number;
  note: string;
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

// ─── Static agent metadata (design baseline) ─────────────────────────────────
// Only the *immutable* presentation metadata lives here. The dynamic fields
// (status / esc / conf / finding / actions) are recomputed from live data by
// the per-agent analyze* functions. The literal strings below are pure
// fallbacks used only when a domain table is completely empty.

interface AgentMeta {
  key: string;
  name: string;
  ico: string;
  color: string;
  dept: string;
  sources: string[];
  // Fallback presentation when there is genuinely no data to analyze.
  fallback: AnalysisResult;
}

const AGENT_META: AgentMeta[] = [
  {
    key: 'water',
    name: 'WaterGuard AI',
    ico: '💧',
    color: 'blue',
    dept: 'Public Works',
    sources: ['SCADA', 'Pressure Sensors', 'Flow Meters', 'Quality Labs'],
    fallback: {
      finding: 'No water assets on record. Monitoring standing by.',
      confidence: 0.4,
      escalation: 'Info',
      status: 'Standby',
      actions: ['Import water-main inventory to begin condition monitoring'],
    },
  },
  {
    key: 'fire',
    name: 'FireWatch AI',
    ico: '🔥',
    color: 'orange',
    dept: 'Emergency Management',
    sources: ['Weather API', 'Satellite', 'IoT Fire Sensors', 'USFS Data'],
    fallback: {
      finding: 'No active wildfire alerts. Conditions nominal.',
      confidence: 0.55,
      escalation: 'Info',
      status: 'Standby',
      actions: ['Maintain seasonal wildfire watch posture'],
    },
  },
  {
    key: 'traffic',
    name: 'TrafficFlow AI',
    ico: '🚦',
    color: 'yellow',
    dept: 'Transportation',
    sources: ['Signal Controllers', 'Loop Detectors', 'GPS Feed', 'Incident Reports'],
    fallback: {
      finding: 'No congestion readings or traffic alerts on record.',
      confidence: 0.5,
      escalation: 'Info',
      status: 'Monitoring',
      actions: ['Connect signal-controller feed for live congestion data'],
    },
  },
  {
    key: 'flood',
    name: 'FloodSense AI',
    ico: '🌊',
    color: 'cyan',
    dept: 'Public Works',
    sources: ['Rain Gauges', 'Stream Gauges', 'Stormwater SCADA', 'Weather Forecast'],
    fallback: {
      finding: 'No flood or drainage alerts active. Channels within capacity.',
      confidence: 0.55,
      escalation: 'Info',
      status: 'Monitoring',
      actions: ['Maintain stormwater monitoring'],
    },
  },
  {
    key: 'road',
    name: 'RoadScan AI',
    ico: '🛣️',
    color: 'gray',
    dept: 'Public Works',
    sources: ['Pothole Reports', 'Asset DB', '311 Reports', 'Pavement Sensors'],
    fallback: {
      finding: 'No road or bridge assets on record. Monitoring standing by.',
      confidence: 0.4,
      escalation: 'Info',
      status: 'Standby',
      actions: ['Import roadway / bridge inventory'],
    },
  },
  {
    key: 'air',
    name: 'AirSense AI',
    ico: '🌫️',
    color: 'purple',
    dept: 'Environment',
    sources: ['AQI Stations', 'Provincial Feed', 'Wind Models', 'Satellite AOD'],
    fallback: {
      finding: 'No air-quality readings on record.',
      confidence: 0.5,
      escalation: 'Info',
      status: 'Monitoring',
      actions: ['Connect AQI station feed'],
    },
  },
  {
    key: 'citizen',
    name: 'CitizenPulse AI',
    ico: '👥',
    color: 'green',
    dept: 'Citizen Services',
    sources: ['311 Reports', 'Social Media', 'Survey Data', 'Permit Requests'],
    fallback: {
      finding: 'No 311 reports in the system yet.',
      confidence: 0.5,
      escalation: 'Info',
      status: 'Monitoring',
      actions: ['Open the 311 intake channel'],
    },
  },
  {
    key: 'grants',
    name: 'GrantRadar AI',
    ico: '💰',
    color: 'emerald',
    dept: 'Finance',
    sources: ['Federal DB', 'Provincial Grants', 'Infrastructure Canada', 'Climate Fund'],
    fallback: {
      finding: 'No capital projects flagged as grant-eligible.',
      confidence: 0.5,
      escalation: 'Info',
      status: 'Monitoring',
      actions: ['Tag capital projects with grant eligibility'],
    },
  },
  {
    key: 'emergency',
    name: 'EmergencyCoord AI',
    ico: '🚨',
    color: 'red',
    dept: 'Emergency Management',
    sources: ['EOC Feed', 'RCMP Liaison', 'EMS CAD', 'BC Hydro Outages'],
    fallback: {
      finding: 'No active emergency declarations. All resources available.',
      confidence: 0.6,
      escalation: 'Info',
      status: 'Standby',
      actions: ['Maintain EOC readiness'],
    },
  },
];

const AGENT_KEYS = AGENT_META.map((a) => a.key);

// Static emergency-resource roster (no table exists for this — roster is static
// per the spec; the *alerts* it reasons over are live).
const EMERGENCY_ROSTER = {
  fireCrews: 24,
  emsUnits: 12,
  eocStatus: 'staffed',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Synthetic perf-test assets are seeded with externalId `SYN-…` and random
 * conditions (some 0). They are NOT real infrastructure, so the agents reason
 * only over curated assets to keep findings meaningful.
 */
const NOT_SYNTHETIC: Prisma.AssetWhereInput = {
  NOT: { externalId: { startsWith: 'SYN-' } },
};

function riskToEscalation(risk: RiskLevel): Escalation {
  switch (risk) {
    case 'CRITICAL':
      return 'Critical';
    case 'ELEVATED':
      return 'Elevated';
    case 'WATCH':
      return 'Watch';
    default:
      return 'Info';
  }
}

function severityToEscalation(sev: Severity): Escalation {
  switch (sev) {
    case 'CRITICAL':
      return 'Critical';
    case 'HIGH':
      return 'Elevated';
    case 'MEDIUM':
      return 'Watch';
    default:
      return 'Info';
  }
}

function escalationToStatus(esc: Escalation): AgentRunStatus {
  switch (esc) {
    case 'Critical':
      return 'Action required';
    case 'Elevated':
      return 'Watch';
    case 'Watch':
      return 'Monitoring';
    default:
      return 'Standby';
  }
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function round(n: number, dp = 3): number {
  return parseFloat(n.toFixed(dp));
}

function money(n: number): string {
  if (n >= 1_000_000) return `$${round(n / 1_000_000, 2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

// Reactive-vs-planned multiplier by urgency: deferring an Immediate project to
// failure is far costlier than deferring a Medium one. Used to estimate a
// reactive cost from the real planned cost when no explicit reactive figure
// exists in the data model.
function reactiveMultiplier(urgency?: string | null): number {
  switch ((urgency ?? '').toLowerCase()) {
    case 'immediate':
      return 4.0;
    case 'high':
      return 2.5;
    case 'medium':
      return 1.6;
    default:
      return 1.3;
  }
}

// ─── Keyword-based fallback chat responses ───────────────────────────────────
// (used only when Gemini is unavailable; enriched at call-time with live numbers)

const FALLBACK_RESPONSES: { keywords: string[]; build: (f: ChatFacts) => string }[] = [
  {
    keywords: ['wildfire', 'fire', 'smoke', 'burn', 'ridge'],
    build: (f) =>
      f.fireAlert
        ? `Wildfire watch: "${f.fireAlert.title}" (${f.fireAlert.location ?? 'unknown location'}), severity ${f.fireAlert.severity}. ${f.criticalAlerts} critical alert(s) active citywide. Monitor FireWatch AI for updates.`
        : 'No active wildfire alerts. FireWatch AI is in seasonal watch posture.',
  },
  {
    keywords: ['aqi', 'air', 'quality', 'pollution', 'pm2.5'],
    build: (f) =>
      f.aqiLatest != null
        ? `Current AQI is ${f.aqiLatest}${f.aqiDistrict ? ` (${f.aqiDistrict})` : ''}, with a 24-hour peak of ${f.aqiPeak}. ${f.aqiLatest > 100 ? 'Unhealthy — advise sensitive groups indoors.' : f.aqiLatest >= 51 ? 'Moderate — sensitive groups should limit prolonged exertion.' : 'Good air quality.'}`
        : 'No AQI readings are currently on record for this tenant.',
  },
  {
    keywords: ['water', 'pressure', 'main', 'leak', 'pipe', 'mx-118'],
    build: (f) =>
      f.worstWater
        ? `WaterGuard AI's top concern is ${f.worstWater.externalId} (${f.worstWater.name}) at condition ${f.worstWater.condition}/100 with a ${Math.round(f.worstWater.failureProb * 100)}% failure probability — risk level ${f.worstWater.riskLevel}.`
        : 'No water assets are currently on record.',
  },
  {
    keywords: ['flood', 'rain', 'creek', 'storm', 'drainage'],
    build: (f) =>
      f.floodAlert
        ? `FloodSense AI is tracking "${f.floodAlert.title}" in ${f.floodAlert.location ?? 'an unknown location'} (severity ${f.floodAlert.severity}). Sandbag teams remain on standby.`
        : 'No flood or drainage alerts are active. Channels are within capacity.',
  },
  {
    keywords: ['traffic', 'congestion', 'pothole', 'bridge', 'road'],
    build: (f) => {
      const parts: string[] = [];
      if (f.trafficAlert)
        parts.push(
          `Traffic: "${f.trafficAlert.title}" in ${f.trafficAlert.location ?? 'an unknown location'} (severity ${f.trafficAlert.severity}).`,
        );
      if (f.worstRoad)
        parts.push(
          `RoadScan flags ${f.worstRoad.externalId} (${f.worstRoad.name}) at condition ${f.worstRoad.condition}/100${f.worstRoad.condition < 60 ? ' — grant-eligible for rehabilitation' : ''}.`,
        );
      return parts.length
        ? parts.join(' ')
        : 'No traffic alerts or road-asset issues are currently on record.';
    },
  },
  {
    keywords: ['grant', 'fund', 'funding', 'money', 'eligible'],
    build: (f) =>
      f.grantCount > 0
        ? `GrantRadar AI tracks ${f.grantCount} grant-eligible capital project(s) worth ${money(f.grantTotal)} in total. ${f.grantDeadlineSoon > 0 ? `${f.grantDeadlineSoon} have deadlines within 6 weeks.` : 'No imminent deadlines.'}`
        : 'No capital projects are currently flagged as grant-eligible.',
  },
  {
    keywords: ['emergency', 'eoc', 'ems', 'dispatch', 'evacuat'],
    build: (f) =>
      f.criticalAlerts > 0
        ? `${f.criticalAlerts} critical alert(s) are active. EOC is ${EMERGENCY_ROSTER.eocStatus}; ${EMERGENCY_ROSTER.fireCrews} fire crews and ${EMERGENCY_ROSTER.emsUnits} EMS units available.`
        : `No active emergency declarations. EOC ${EMERGENCY_ROSTER.eocStatus}; all resources available.`,
  },
  {
    keywords: ['citizen', '311', 'report', 'complaint', 'cluster'],
    build: (f) =>
      `${f.unrouted} unrouted 311 report(s) of ${f.reportTotal} total.${f.topCluster ? ` Largest cluster: ${f.topCluster.duplicateCount}× "${f.topCluster.category}" at ${f.topCluster.location}.` : ''}`,
  },
  {
    keywords: ['agent', 'agents', 'status', 'briefing', 'overview'],
    build: (f) =>
      `There are ${AGENT_KEYS.length} AI agents monitoring Meridian. Current city risk is ${f.riskLabel}. ${f.criticalAlerts} critical and ${f.highAlerts} high-severity alerts are active.`,
  },
];

interface ChatFacts {
  riskLabel: string;
  worstWater: { externalId: string; name: string; condition: number; failureProb: number; riskLevel: RiskLevel } | null;
  worstRoad: { externalId: string; name: string; condition: number } | null;
  aqiLatest: number | null;
  aqiPeak: number | null;
  aqiDistrict: string | null;
  fireAlert: { title: string; severity: Severity; location: string | null } | null;
  floodAlert: { title: string; severity: Severity; location: string | null } | null;
  trafficAlert: { title: string; severity: Severity; location: string | null } | null;
  criticalAlerts: number;
  highAlerts: number;
  grantCount: number;
  grantTotal: number;
  grantDeadlineSoon: number;
  unrouted: number;
  reportTotal: number;
  topCluster: { category: string; location: string; duplicateCount: number } | null;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(private prisma: PrismaService) {}

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Run one agent: compute its data-driven finding, persist an AgentRun row,
   * and return that row.
   */
  async runAgent(tenantId: string, agentKey: string): Promise<AgentRun> {
    const meta = AGENT_META.find((a) => a.key === agentKey);
    if (!meta) {
      throw new NotFoundException(`Agent '${agentKey}' not found`);
    }

    const analysis = await this.analyze(tenantId, agentKey);
    const phrased = await this.maybePhrase(meta, analysis);

    const run = await this.prisma.agentRun.create({
      data: {
        tenantId,
        agentKey,
        status: phrased.status,
        finding: phrased.finding,
        confidence: round(clamp01(phrased.confidence)),
        escalation: phrased.escalation,
        actions: phrased.actions,
        runAt: new Date(),
      },
    });

    return run as AgentRun;
  }

  /**
   * The 9 agents, each merged with its LATEST AgentRun. If an agent has no run
   * yet, its finding is computed fresh from live data on the spot.
   */
  async getAllAgents(tenantId: string): Promise<AgentStatus[]> {
    const runs = await this.prisma.agentRun.findMany({
      where: { tenantId },
      orderBy: { runAt: 'desc' },
    });

    const latestByKey = new Map<string, (typeof runs)[number]>();
    for (const run of runs) {
      if (!latestByKey.has(run.agentKey)) latestByKey.set(run.agentKey, run);
    }

    return Promise.all(
      AGENT_META.map(async (meta) => {
        const run = latestByKey.get(meta.key);
        if (run && run.finding) {
          return this.toAgentStatus(meta, {
            finding: run.finding,
            confidence: run.confidence ?? meta.fallback.confidence,
            escalation: (run.escalation as Escalation) ?? meta.fallback.escalation,
            status: (run.status as AgentRunStatus) ?? meta.fallback.status,
            actions: Array.isArray(run.actions)
              ? (run.actions as string[])
              : meta.fallback.actions,
          });
        }
        // No prior run → compute fresh so the dashboard still shows live state.
        const fresh = await this.analyze(tenantId, meta.key);
        return this.toAgentStatus(meta, fresh);
      }),
    );
  }

  /**
   * Morning briefing assembled entirely from real rows.
   * Falls back gracefully when tables are sparse.
   */
  async getMorningBriefing(tenantId: string): Promise<Briefing> {
    const [agents, topRisks, overnight, attention, expensive, tenant] =
      await Promise.all([
        this.getAllAgents(tenantId),
        this.computeTopRisks(tenantId),
        this.computeOvernight(tenantId),
        this.computeAttention(tenantId),
        this.computeExpensive(tenantId),
        this.prisma.tenant.findUnique({ where: { id: tenantId } }),
      ]);

    const criticalCount = agents.filter((a) => a.esc === 'Critical').length;
    const elevatedCount = agents.filter((a) => a.esc === 'Elevated').length;
    const actionCount = agents.filter((a) => a.status === 'Action required').length;

    let riskLevel = tenant?.riskLabel ?? 'Normal';
    if (criticalCount > 0) riskLevel = 'Critical';
    else if (elevatedCount > 0) riskLevel = 'Elevated';
    else if (agents.some((a) => a.esc === 'Watch')) riskLevel = 'Watch';

    const highlights = agents
      .filter((a) => a.esc === 'Critical' || a.esc === 'Elevated')
      .map((a) => `[${a.esc}] ${a.name}: ${a.finding.slice(0, 140)}`);

    return {
      generatedAt: new Date(),
      riskLevel,
      headline: actionCount
        ? `${actionCount} agent${actionCount !== 1 ? 's' : ''} require immediate action. Overall city risk: ${riskLevel}.`
        : `All agents nominal. Overall city risk: ${riskLevel}.`,
      highlights,
      agents,
      criticalCount,
      elevatedCount,
      topRisks,
      overnight,
      attention,
      expensive,
    };
  }

  /**
   * Chat: Gemini if configured, else keyword-scripted fallback — but the
   * fallback answers are enriched with one or two REAL numbers from the DB so
   * the assistant reflects live state.
   */
  async chat(
    tenantId: string,
    message: string,
    history: ChatMessageDto[],
  ): Promise<string> {
    const facts = await this.collectChatFacts(tenantId);
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        return await this.callGemini(apiKey, message, history, facts);
      } catch (err) {
        this.logger.warn(
          `Gemini API error — falling back to data-enriched scripted response: ${err}`,
        );
      }
    }

    return this.scriptedResponse(message, facts);
  }

  // ── Per-agent analysis dispatch ────────────────────────────────────────────

  /** Route to the agent-specific analyzer; never throws — degrades to fallback. */
  private async analyze(tenantId: string, agentKey: string): Promise<AnalysisResult> {
    const meta = AGENT_META.find((a) => a.key === agentKey)!;
    try {
      switch (agentKey) {
        case 'water':
          return await this.analyzeWater(tenantId, meta);
        case 'road':
          return await this.analyzeRoad(tenantId, meta);
        case 'citizen':
          return await this.analyzeCitizen(tenantId, meta);
        case 'grants':
          return await this.analyzeGrants(tenantId, meta);
        case 'air':
          return await this.analyzeAir(tenantId, meta);
        case 'fire':
          return await this.analyzeAlertDomain(tenantId, meta, ['Wildfire', 'Fire'], 'Wildfire risk');
        case 'flood':
          return await this.analyzeAlertDomain(tenantId, meta, ['Flooding', 'Flood', 'Drainage'], 'Flood / drainage risk');
        case 'traffic':
          return await this.analyzeTraffic(tenantId, meta);
        case 'emergency':
          return await this.analyzeEmergency(tenantId, meta);
        default:
          return meta.fallback;
      }
    } catch (err) {
      this.logger.error(`analyze('${agentKey}') failed: ${err}`);
      return meta.fallback;
    }
  }

  // ── water ──────────────────────────────────────────────────────────────────

  private async analyzeWater(tenantId: string, meta: AgentMeta): Promise<AnalysisResult> {
    const worst = await this.prisma.asset.findFirst({
      where: {
        tenantId,
        type: { in: ['WATER_MAIN', 'PUMP_STATION', 'WATER_STATION', 'HYDRANT'] },
        ...NOT_SYNTHETIC,
      },
      orderBy: [{ condition: 'asc' }, { failureProb: 'desc' }],
    });
    if (!worst) return meta.fallback;

    const failPct = Math.round(worst.failureProb * 100);
    const escalation = riskToEscalation(worst.riskLevel);
    // Confidence scales with how extreme the values are: low condition + high
    // failure probability = high confidence in the call.
    const confidence = clamp01(0.55 + (100 - worst.condition) / 220 + worst.failureProb / 4);

    const finding =
      `Worst water asset is ${worst.externalId ?? worst.id} (${worst.name}) in ${worst.district ?? 'unknown district'}: ` +
      `condition ${worst.condition}/100, failure probability ${failPct}%, risk ${worst.riskLevel}. ` +
      (worst.condition <= 45
        ? 'Below replacement threshold — predicted failure window is near.'
        : 'Trending down; schedule condition re-survey.');

    return {
      finding,
      confidence,
      escalation,
      status: escalationToStatus(escalation),
      actions: [
        `Dispatch inspection crew to ${worst.externalId ?? worst.name}`,
        worst.riskLevel === 'CRITICAL'
          ? 'Stage emergency repair / isolation plan'
          : 'Add to capital replacement pipeline',
        'Notify affected residents via 311 if pressure drops',
      ],
    };
  }

  // ── road ─────────────────────────────────────────────────────────────────

  private async analyzeRoad(tenantId: string, meta: AgentMeta): Promise<AnalysisResult> {
    const worst = await this.prisma.asset.findFirst({
      where: {
        tenantId,
        type: { in: ['BRIDGE', 'ROAD_SEGMENT'] },
        ...NOT_SYNTHETIC,
      },
      orderBy: [{ condition: 'asc' }, { failureProb: 'desc' }],
    });
    if (!worst) return meta.fallback;

    const grantEligible = worst.condition < 60;
    const escalation = riskToEscalation(worst.riskLevel);
    const confidence = clamp01(0.55 + (100 - worst.condition) / 220 + worst.failureProb / 4);

    const finding =
      `Worst ${worst.type === 'BRIDGE' ? 'bridge' : 'road segment'} is ${worst.externalId ?? worst.id} (${worst.name}) ` +
      `in ${worst.district ?? 'unknown district'}: condition ${worst.condition}/100, ` +
      `failure probability ${Math.round(worst.failureProb * 100)}%, risk ${worst.riskLevel}. ` +
      (grantEligible
        ? 'Condition < 60 → grant-eligible for rehabilitation funding.'
        : 'Above grant-eligibility threshold; continue routine inspection.');

    return {
      finding,
      confidence,
      escalation,
      status: escalationToStatus(escalation),
      actions: [
        `Schedule re-inspection of ${worst.externalId ?? worst.name}`,
        grantEligible
          ? 'Open a grant application for rehabilitation'
          : 'Assign patch / maintenance crew',
        'Review overdue work orders with supervisor',
      ],
    };
  }

  // ── citizen (311) ──────────────────────────────────────────────────────────

  private async analyzeCitizen(tenantId: string, meta: AgentMeta): Promise<AnalysisResult> {
    const [byStatus, topCluster, total] = await Promise.all([
      this.prisma.report311.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { _all: true },
      }),
      this.prisma.report311.findFirst({
        where: { tenantId },
        orderBy: { duplicateCount: 'desc' },
      }),
      this.prisma.report311.count({ where: { tenantId } }),
    ]);

    if (total === 0) return meta.fallback;

    const countFor = (s: string) =>
      byStatus.find((g) => g.status === s)?._count._all ?? 0;
    // "Unrouted" = not yet dispatched to a department.
    const unrouted = countFor('NEW') + countFor('ROUTING');
    const inProgress = countFor('IN_PROGRESS');
    const resolved = countFor('RESOLVED') + countFor('CLOSED');

    const clusterTxt =
      topCluster && topCluster.duplicateCount > 0
        ? `Largest cluster: ${topCluster.duplicateCount}× "${topCluster.category}" at ${topCluster.location} (status ${topCluster.status}).`
        : 'No duplicate clusters detected.';

    // Escalation rises with unrouted backlog and cluster size.
    const clusterSize = topCluster?.duplicateCount ?? 0;
    let escalation: Escalation = 'Info';
    if (unrouted >= 5 || clusterSize >= 8) escalation = 'Elevated';
    else if (unrouted >= 2 || clusterSize >= 3) escalation = 'Watch';

    const confidence = clamp01(0.6 + Math.min(total, 50) / 250 + clusterSize / 40);

    const finding =
      `${total} 311 report(s) on record — ${unrouted} unrouted, ${inProgress} in progress, ${resolved} resolved. ${clusterTxt}`;

    const actions: string[] = [];
    if (unrouted > 0) actions.push(`Route ${unrouted} unrouted report(s) to the right department`);
    if (topCluster && topCluster.duplicateCount >= 3)
      actions.push(`Investigate ${topCluster.location} cluster (possible unreported ${topCluster.category.toLowerCase()})`);
    actions.push('Review SLA compliance on open reports');

    return { finding, confidence, escalation, status: escalationToStatus(escalation), actions };
  }

  // ── grants ─────────────────────────────────────────────────────────────────

  private async analyzeGrants(tenantId: string, meta: AgentMeta): Promise<AnalysisResult> {
    const eligible = await this.prisma.capitalProject.findMany({
      where: {
        tenantId,
        grantEligibility: { not: null, notIn: ['', 'Not eligible', 'Ineligible'] },
      },
      select: { title: true, cost: true, deadline: true, grantProgram: true },
    });

    if (eligible.length === 0) return meta.fallback;

    const total = eligible.reduce((sum, p) => sum + (p.cost ?? 0), 0);
    const now = Date.now();
    const sixWeeks = 42 * 24 * 60 * 60 * 1000;
    const dueSoon = eligible.filter(
      (p) => p.deadline && p.deadline.getTime() - now <= sixWeeks && p.deadline.getTime() >= now,
    );
    const biggest = [...eligible].sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0))[0];

    const finding =
      `${eligible.length} grant-eligible capital project(s) worth ${money(total)} total. ` +
      `Largest: "${biggest.title}" at ${money(biggest.cost ?? 0)}` +
      (biggest.grantProgram ? ` (${biggest.grantProgram}).` : '.') +
      (dueSoon.length
        ? ` ${dueSoon.length} application(s) close within 6 weeks — act now.`
        : ' No deadlines within 6 weeks.');

    // Opportunity confidence: more eligible value = more confident there's money on the table.
    const confidence = clamp01(0.7 + Math.min(eligible.length, 10) / 40 + Math.min(total, 20_000_000) / 100_000_000);
    const escalation: Escalation = dueSoon.length ? 'Watch' : 'Info';

    return {
      finding,
      confidence,
      escalation,
      status: 'Opportunity',
      actions: [
        `Assign a grant writer to "${biggest.title}"`,
        dueSoon.length
          ? `Submit Letter(s) of Intent for ${dueSoon.length} deadline(s)`
          : 'Compile supporting data for the strongest application',
        'Confirm matching-fund availability with Finance',
      ],
    };
  }

  // ── air (EnvironmentalReading: AQI) ─────────────────────────────────────────

  private async analyzeAir(tenantId: string, meta: AgentMeta): Promise<AnalysisResult> {
    const readings = await this.prisma.environmentalReading.findMany({
      where: { tenantId, metric: 'AQI' },
      orderBy: { recordedAt: 'desc' },
      take: 24,
    });
    if (readings.length === 0) return meta.fallback;

    const latest = readings[0];
    const peak = readings.reduce((m, r) => (r.value > m.value ? r : m), readings[0]);
    const avg = readings.reduce((s, r) => s + r.value, 0) / readings.length;
    const aqi = Math.round(latest.value);
    const peakVal = Math.round(peak.value);

    let escalation: Escalation = 'Info';
    let band = 'Good';
    if (aqi > 150) { escalation = 'Elevated'; band = 'Unhealthy'; }
    else if (aqi > 100) { escalation = 'Watch'; band = 'Unhealthy for Sensitive Groups'; }
    else if (aqi >= 51) { escalation = 'Watch'; band = 'Moderate'; }

    const confidence = clamp01(0.6 + Math.min(readings.length, 24) / 80 + aqi / 400);

    const finding =
      `Latest AQI ${aqi} (${band})${latest.district ? ` in ${latest.district}` : ''}; ` +
      `24-reading peak ${peakVal}${peak.district ? ` in ${peak.district}` : ''}, average ${Math.round(avg)}. ` +
      (aqi >= 51 ? 'Sensitive groups advised to limit prolonged outdoor exertion.' : 'Air quality within healthy range.');

    return {
      finding,
      confidence,
      escalation,
      status: escalationToStatus(escalation),
      actions:
        aqi >= 51
          ? [
              'Issue public advisory for sensitive groups',
              'Notify school board for outdoor-activity limits',
              'Continue hourly AQI monitoring',
            ]
          : ['Continue routine AQI monitoring'],
    };
  }

  // ── fire / flood (Alert-backed domains) ─────────────────────────────────────

  private async analyzeAlertDomain(
    tenantId: string,
    meta: AgentMeta,
    categories: string[],
    label: string,
  ): Promise<AnalysisResult> {
    const alerts = await this.prisma.alert.findMany({
      where: { tenantId, category: { in: categories }, resolvedAt: null },
      orderBy: { severity: 'desc' },
    });
    if (alerts.length === 0) return meta.fallback;

    const worst = alerts[0];
    const escalation = severityToEscalation(worst.severity);
    const confidence = clamp01(
      0.6 +
        Math.min(alerts.length, 5) / 20 +
        (worst.severity === 'CRITICAL' ? 0.2 : worst.severity === 'HIGH' ? 0.12 : 0.04),
    );

    const finding =
      `${label}: ${alerts.length} active alert(s). Top: "${worst.title}"` +
      (worst.location ? ` at ${worst.location}` : '') +
      ` (severity ${worst.severity}). ${alerts.length > 1 ? `${alerts.length - 1} additional alert(s) in this domain.` : ''}`;

    return {
      finding,
      confidence,
      escalation,
      status: escalationToStatus(escalation),
      actions: [
        `Action top alert: ${worst.title}`,
        worst.department ? `Coordinate with ${worst.department}` : 'Assign owning department',
        'Issue public advisory if conditions worsen',
      ],
    };
  }

  // ── traffic (TrafficReading → falls back to Traffic alerts) ──────────────────

  private async analyzeTraffic(tenantId: string, meta: AgentMeta): Promise<AnalysisResult> {
    const readings = await this.prisma.trafficReading.findMany({
      where: { tenantId },
      orderBy: { recordedAt: 'desc' },
      take: 50,
    });

    if (readings.length > 0) {
      const worst = readings.reduce(
        (m, r) => ((r.congestionIndex ?? 0) > (m.congestionIndex ?? 0) ? r : m),
        readings[0],
      );
      const idx = worst.congestionIndex ?? 0;
      const delay = worst.delaySeconds ?? 0;
      let escalation: Escalation = 'Info';
      if (idx >= 1.5) escalation = 'Elevated';
      else if (idx >= 1.2) escalation = 'Watch';
      const confidence = clamp01(0.6 + Math.min(readings.length, 50) / 200 + Math.min(idx, 2) / 8);
      const finding =
        `Worst intersection: ${worst.intersection} — congestion index ${round(idx, 2)}, ` +
        `delay ${delay}s. ${readings.length} reading(s) analyzed.`;
      return {
        finding,
        confidence,
        escalation,
        status: escalationToStatus(escalation),
        actions: [
          `Deploy traffic control to ${worst.intersection}`,
          'Activate alternate-route signage',
          'Extend green cycles on the affected corridor',
        ],
      };
    }

    // No live readings → reason over Traffic alerts.
    return this.analyzeAlertDomain(tenantId, meta, ['Traffic'], 'Traffic conditions');
  }

  // ── emergency (active critical alerts + static roster) ───────────────────────

  private async analyzeEmergency(tenantId: string, meta: AgentMeta): Promise<AnalysisResult> {
    const [criticalAlerts, highAlerts] = await Promise.all([
      this.prisma.alert.findMany({
        where: { tenantId, severity: 'CRITICAL', resolvedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.alert.count({
        where: { tenantId, severity: 'HIGH', resolvedAt: null },
      }),
    ]);

    const critCount = criticalAlerts.length;
    if (critCount === 0 && highAlerts === 0) return meta.fallback;

    const escalation: Escalation = critCount > 0 ? 'Critical' : 'Elevated';
    const confidence = clamp01(0.75 + Math.min(critCount, 4) / 12);

    const titles = criticalAlerts.slice(0, 3).map((a) => `"${a.title}"`).join('; ');
    const finding =
      `${critCount} active critical alert(s)${critCount ? `: ${titles}` : ''}, plus ${highAlerts} high-severity. ` +
      `Resources: ${EMERGENCY_ROSTER.fireCrews} fire crews, ${EMERGENCY_ROSTER.emsUnits} EMS units available; EOC ${EMERGENCY_ROSTER.eocStatus}.`;

    return {
      finding,
      confidence,
      escalation,
      status: critCount > 0 ? 'Action required' : 'Watch',
      actions: [
        critCount > 0 ? 'Convene EOC on active critical incidents' : 'Maintain elevated readiness',
        'Confirm crew pre-positioning for active corridors',
        'Verify mass-notification system is armed',
      ],
    };
  }

  // ── Briefing builders (all from real rows) ───────────────────────────────────

  private async computeTopRisks(tenantId: string): Promise<BriefingRisk[]> {
    const [assets, criticalAlerts] = await Promise.all([
      this.prisma.asset.findMany({
        where: { tenantId, ...NOT_SYNTHETIC, riskLevel: { in: ['CRITICAL', 'ELEVATED'] } },
        orderBy: [{ failureProb: 'desc' }, { condition: 'asc' }],
        take: 3,
      }),
      this.prisma.alert.findMany({
        where: { tenantId, severity: 'CRITICAL', resolvedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
    ]);

    const risks: BriefingRisk[] = [];
    for (const a of assets) {
      risks.push({
        ref: a.externalId ?? a.id,
        label: a.name,
        detail: `Condition ${a.condition}/100, failure ${Math.round(a.failureProb * 100)}% (${a.district ?? 'unknown'})`,
        escalation: riskToEscalation(a.riskLevel),
      });
    }
    for (const al of criticalAlerts) {
      risks.push({
        ref: al.externalId ?? al.id,
        label: al.title,
        detail: `${al.category} alert${al.location ? ` · ${al.location}` : ''}`,
        escalation: severityToEscalation(al.severity),
      });
    }
    return risks.slice(0, 5);
  }

  private async computeOvernight(tenantId: string): Promise<string[]> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [newAlerts, newReports, newRuns] = await Promise.all([
      this.prisma.alert.count({ where: { tenantId, createdAt: { gte: since } } }),
      this.prisma.report311.count({ where: { tenantId, createdAt: { gte: since } } }),
      this.prisma.agentRun.count({ where: { tenantId, runAt: { gte: since } } }),
    ]);
    const out: string[] = [];
    out.push(`${newAlerts} alert(s) raised in the last 24h`);
    out.push(`${newReports} new 311 report(s) in the last 24h`);
    out.push(`${newRuns} agent analysis run(s) completed overnight`);
    return out;
  }

  private async computeAttention(tenantId: string): Promise<string[]> {
    const [unrouted, overdueWO, criticalAssets] = await Promise.all([
      this.prisma.report311.count({
        where: { tenantId, status: { in: ['NEW', 'ROUTING'] } },
      }),
      this.prisma.workOrder.count({
        where: {
          tenantId,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
          dueDate: { lt: new Date() },
        },
      }),
      this.prisma.asset.findMany({
        where: { tenantId, ...NOT_SYNTHETIC, riskLevel: 'CRITICAL' },
        take: 3,
      }),
    ]);

    const out: string[] = [];
    for (const a of criticalAssets) {
      out.push(`Authorize action on ${a.externalId ?? a.name} (${a.name}) — risk CRITICAL`);
    }
    if (unrouted > 0) out.push(`Route ${unrouted} unrouted 311 report(s)`);
    if (overdueWO > 0) out.push(`Review ${overdueWO} overdue work order(s)`);
    if (out.length === 0) out.push('No decisions require immediate attention.');
    return out.slice(0, 5);
  }

  private async computeExpensive(tenantId: string): Promise<ExpensiveItem[]> {
    const projects = await this.prisma.capitalProject.findMany({
      where: { tenantId },
      select: { title: true, cost: true, urgency: true },
    });
    if (projects.length === 0) return [];

    return projects
      .filter((p) => (p.cost ?? 0) > 0)
      .map((p) => {
        const planned = p.cost ?? 0;
        const reactive = planned * reactiveMultiplier(p.urgency);
        return {
          title: p.title,
          plannedCost: round(planned, 0),
          reactiveCost: round(reactive, 0),
          gap: round(reactive - planned, 0),
          note: `${p.urgency ?? 'Standard'} urgency — deferring to failure ≈ ${money(reactive)} vs ${money(planned)} planned`,
        };
      })
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 3);
  }

  // ── Mapping helpers ──────────────────────────────────────────────────────────

  private toAgentStatus(meta: AgentMeta, a: AnalysisResult): AgentStatus {
    return {
      key: meta.key,
      name: meta.name,
      ico: meta.ico,
      color: meta.color,
      dept: meta.dept,
      sources: meta.sources,
      status: a.status,
      esc: a.escalation,
      conf: round(clamp01(a.confidence)),
      finding: a.finding,
      actions: a.actions,
    };
  }

  // ── Optional LLM phrasing layer ──────────────────────────────────────────────

  /**
   * If GEMINI_API_KEY is set, ask Gemini to phrase the already-computed,
   * data-driven finding more naturally — passing the real numbers in the
   * prompt. On ANY error (or empty key) the computed text is kept verbatim.
   * Never blocks: hard short timeout.
   */
  private async maybePhrase(meta: AgentMeta, analysis: AnalysisResult): Promise<AnalysisResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return analysis;

    try {
      const prompt =
        `You are ${meta.name}, a civic-infrastructure monitoring agent. ` +
        `Rephrase the following finding in one or two crisp sentences for a city manager. ` +
        `Do NOT invent or change any numbers, IDs, or facts — keep every figure exactly as given. ` +
        `Finding: ${analysis.finding}`;
      const text = await this.geminiGenerate(apiKey, prompt, 4000);
      if (text && text.trim()) return { ...analysis, finding: text.trim() };
    } catch (err) {
      this.logger.warn(`Gemini phrasing failed for '${meta.key}', keeping computed text: ${err}`);
    }
    return analysis;
  }

  // ── Gemini chat ───────────────────────────────────────────────────────────

  private async callGemini(
    apiKey: string,
    message: string,
    history: ChatMessageDto[],
    facts: ChatFacts,
  ): Promise<string> {
    const systemPrompt =
      "You are Meridian's AI assistant for the CityPulse civic infrastructure platform. " +
      'Answer concisely in 2-4 sentences using ONLY the live facts below; do not invent numbers.\n' +
      `LIVE FACTS: city risk=${facts.riskLabel}; ` +
      (facts.worstWater
        ? `worst water asset ${facts.worstWater.externalId} condition ${facts.worstWater.condition}/100 failure ${Math.round(facts.worstWater.failureProb * 100)}%; `
        : 'no water assets; ') +
      (facts.worstRoad
        ? `worst road ${facts.worstRoad.externalId} condition ${facts.worstRoad.condition}/100; `
        : '') +
      (facts.aqiLatest != null ? `AQI ${facts.aqiLatest} (peak ${facts.aqiPeak}); ` : '') +
      `${facts.criticalAlerts} critical + ${facts.highAlerts} high alerts; ` +
      `${facts.unrouted}/${facts.reportTotal} 311 reports unrouted; ` +
      `${facts.grantCount} grant-eligible projects worth ${money(facts.grantTotal)}.`;

    const contents: { role: string; parts: { text: string }[] }[] = [];
    if (history.length === 0) {
      contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
      contents.push({
        role: 'model',
        parts: [{ text: 'Understood. How can I help you with CityPulse today?' }],
      });
    } else {
      // Prepend facts so context is always present.
      contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
      contents.push({ role: 'model', parts: [{ text: 'Acknowledged.' }] });
    }
    for (const h of history) contents.push({ role: h.role, parts: [{ text: h.content }] });
    contents.push({ role: 'user', parts: [{ text: message }] });

    const text = await this.geminiGenerate(apiKey, contents, 6000);
    if (!text) throw new Error('Empty Gemini response');
    return text.trim();
  }

  /**
   * Low-level Gemini REST call with a hard timeout via AbortController.
   * Accepts either a plain prompt string or a pre-built `contents` array.
   */
  private async geminiGenerate(
    apiKey: string,
    promptOrContents: string | { role: string; parts: { text: string }[] }[],
    timeoutMs: number,
  ): Promise<string | null> {
    const contents =
      typeof promptOrContents === 'string'
        ? [{ role: 'user', parts: [{ text: promptOrContents }] }]
        : promptOrContents;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const body = JSON.stringify({
      contents,
      generationConfig: { maxOutputTokens: 256, temperature: 0.4 },
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini HTTP ${res.status}: ${errText}`);
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Chat facts + scripted fallback ───────────────────────────────────────────

  private async collectChatFacts(tenantId: string): Promise<ChatFacts> {
    const [
      worstWater,
      worstRoad,
      aqiReadings,
      fireAlert,
      floodAlert,
      trafficAlert,
      criticalAlerts,
      highAlerts,
      grantProjects,
      reportTotal,
      unrouted,
      topCluster,
      tenant,
    ] = await Promise.all([
      this.prisma.asset.findFirst({
        where: { tenantId, type: { in: ['WATER_MAIN', 'PUMP_STATION', 'WATER_STATION'] }, ...NOT_SYNTHETIC },
        orderBy: [{ condition: 'asc' }, { failureProb: 'desc' }],
      }),
      this.prisma.asset.findFirst({
        where: { tenantId, type: { in: ['BRIDGE', 'ROAD_SEGMENT'] }, ...NOT_SYNTHETIC },
        orderBy: [{ condition: 'asc' }, { failureProb: 'desc' }],
      }),
      this.prisma.environmentalReading.findMany({
        where: { tenantId, metric: 'AQI' },
        orderBy: { recordedAt: 'desc' },
        take: 24,
      }),
      this.prisma.alert.findFirst({
        where: { tenantId, category: { in: ['Wildfire', 'Fire'] }, resolvedAt: null },
        orderBy: { severity: 'desc' },
      }),
      this.prisma.alert.findFirst({
        where: { tenantId, category: { in: ['Flooding', 'Flood', 'Drainage'] }, resolvedAt: null },
        orderBy: { severity: 'desc' },
      }),
      this.prisma.alert.findFirst({
        where: { tenantId, category: 'Traffic', resolvedAt: null },
        orderBy: { severity: 'desc' },
      }),
      this.prisma.alert.count({ where: { tenantId, severity: 'CRITICAL', resolvedAt: null } }),
      this.prisma.alert.count({ where: { tenantId, severity: 'HIGH', resolvedAt: null } }),
      this.prisma.capitalProject.findMany({
        where: { tenantId, grantEligibility: { not: null, notIn: ['', 'Not eligible', 'Ineligible'] } },
        select: { cost: true, deadline: true },
      }),
      this.prisma.report311.count({ where: { tenantId } }),
      this.prisma.report311.count({ where: { tenantId, status: { in: ['NEW', 'ROUTING'] } } }),
      this.prisma.report311.findFirst({ where: { tenantId }, orderBy: { duplicateCount: 'desc' } }),
      this.prisma.tenant.findUnique({ where: { id: tenantId } }),
    ]);

    const aqiLatest = aqiReadings[0] ? Math.round(aqiReadings[0].value) : null;
    const aqiPeak = aqiReadings.length
      ? Math.round(Math.max(...aqiReadings.map((r) => r.value)))
      : null;
    const now = Date.now();
    const sixWeeks = 42 * 24 * 60 * 60 * 1000;

    return {
      riskLabel: tenant?.riskLabel ?? 'Normal',
      worstWater: worstWater
        ? {
            externalId: worstWater.externalId ?? worstWater.id,
            name: worstWater.name,
            condition: worstWater.condition,
            failureProb: worstWater.failureProb,
            riskLevel: worstWater.riskLevel,
          }
        : null,
      worstRoad: worstRoad
        ? { externalId: worstRoad.externalId ?? worstRoad.id, name: worstRoad.name, condition: worstRoad.condition }
        : null,
      aqiLatest,
      aqiPeak,
      aqiDistrict: aqiReadings[0]?.district ?? null,
      fireAlert: fireAlert
        ? { title: fireAlert.title, severity: fireAlert.severity, location: fireAlert.location }
        : null,
      floodAlert: floodAlert
        ? { title: floodAlert.title, severity: floodAlert.severity, location: floodAlert.location }
        : null,
      trafficAlert: trafficAlert
        ? { title: trafficAlert.title, severity: trafficAlert.severity, location: trafficAlert.location }
        : null,
      criticalAlerts,
      highAlerts,
      grantCount: grantProjects.length,
      grantTotal: grantProjects.reduce((s, p) => s + (p.cost ?? 0), 0),
      grantDeadlineSoon: grantProjects.filter(
        (p) => p.deadline && p.deadline.getTime() - now <= sixWeeks && p.deadline.getTime() >= now,
      ).length,
      unrouted,
      reportTotal,
      topCluster:
        topCluster && topCluster.duplicateCount > 0
          ? {
              category: topCluster.category,
              location: topCluster.location,
              duplicateCount: topCluster.duplicateCount,
            }
          : null,
    };
  }

  private scriptedResponse(message: string, facts: ChatFacts): string {
    const lower = message.toLowerCase();

    for (const entry of FALLBACK_RESPONSES) {
      if (entry.keywords.some((kw) => lower.includes(kw))) {
        return entry.build(facts);
      }
    }

    // Generic answer, still anchored to live numbers.
    const bits: string[] = [`City risk is currently ${facts.riskLabel}.`];
    if (facts.worstWater)
      bits.push(
        `Top infrastructure concern: ${facts.worstWater.externalId} at condition ${facts.worstWater.condition}/100 (${Math.round(facts.worstWater.failureProb * 100)}% failure risk).`,
      );
    if (facts.criticalAlerts > 0)
      bits.push(`${facts.criticalAlerts} critical alert(s) are active.`);
    bits.push('What would you like to know more about?');
    return bits.join(' ');
  }
}
