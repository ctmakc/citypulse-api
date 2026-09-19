import PDFDocument from 'pdfkit';
import type {
  TenantHeader,
  AlertRow,
  PriorityAction,
  GrantSummary,
  RiskBreakdown,
  AssetRow,
  EnvReadingRow,
} from './reports.data.js';
import { REPORT_TITLES, type ReportType } from './reports.types.js';

/** Brand palette (matches the CityPULSE design tokens). */
const INK = '#0B1F33';
const ACCENT = '#1E6FD9';
const MUTED = '#5B6B7B';
const HAIR = '#D7DEE6';
const SEV_COLOR: Record<string, string> = {
  CRITICAL: '#C0392B',
  HIGH: '#E67E22',
  MEDIUM: '#B7950B',
  LOW: '#5B6B7B',
  OK: '#1E8449',
  WATCH: '#B7950B',
  ELEVATED: '#E67E22',
};

const PAGE_MARGIN = 50;

export interface PdfReportInput {
  type: ReportType;
  tenant: TenantHeader;
  generatedAt: Date;
  counts: {
    assets: number;
    openAlerts: number;
    criticalAlerts: number;
    open311: number;
    activeWorkOrders: number;
    projects: number;
  };
  alerts: AlertRow[];
  actions: PriorityAction[];
  grant: GrantSummary;
  risk: RiskBreakdown;
  conditionAverages: { avgCondition: number; avgFailureProb: number };
  riskiestAssets: AssetRow[];
  environment: EnvReadingRow[];
}

/**
 * pdfkit's built-in Helvetica uses WinAnsi encoding, which lacks some unicode
 * punctuation that appears in seeded data (e.g. ≤ ≥ → •). Map those to safe
 * equivalents so they render instead of dropping to a blank/placeholder glyph.
 * Characters already in WinAnsi (— · € …) pass through untouched.
 */
function safe(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/•/g, '-')
    .replace(/≈/g, '~')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');
}

function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/**
 * Render a CityPULSE report to a PDF Buffer using pdfkit (pure node, no
 * headless browser). Multi-section: branded header, executive summary band,
 * and type-specific sections built from real tenant data.
 */
export function buildReportPdf(input: PdfReportInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE_MARGIN,
      bufferPages: true,
      info: {
        Title: `${REPORT_TITLES[input.type]} — ${input.tenant.name}`,
        Author: 'CityPULSE',
        Subject: REPORT_TITLES[input.type],
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const contentWidth = doc.page.width - PAGE_MARGIN * 2;

    // ---- Branded header ---------------------------------------------------
    drawWordmark(doc);
    doc
      .fillColor(MUTED)
      .fontSize(9)
      .font('Helvetica')
      .text('AI-POWERED TERRITORIAL INTELLIGENCE', PAGE_MARGIN, 38, {
        align: 'right',
        width: contentWidth,
      });

    doc
      .moveTo(PAGE_MARGIN, 64)
      .lineTo(doc.page.width - PAGE_MARGIN, 64)
      .strokeColor(ACCENT)
      .lineWidth(2)
      .stroke();

    doc.y = 80;
    doc
      .fillColor(INK)
      .font('Helvetica-Bold')
      .fontSize(22)
      .text(REPORT_TITLES[input.type], PAGE_MARGIN, doc.y);
    doc
      .fillColor(INK)
      .font('Helvetica')
      .fontSize(13)
      .text(`${safe(input.tenant.name)} · ${input.tenant.type}`, {
        continued: false,
      });
    doc
      .fillColor(MUTED)
      .fontSize(9)
      .text(
        `Generated ${input.generatedAt.toISOString().replace('T', ' ').slice(0, 19)} UTC` +
          (input.tenant.population
            ? ` · Population ${input.tenant.population.toLocaleString()}`
            : ''),
      );

    doc.moveDown(0.8);

    // ---- Executive summary band ------------------------------------------
    sectionTitle(doc, 'Executive Summary');
    drawRiskBanner(doc, input.tenant, contentWidth);
    doc.moveDown(0.5);
    drawKpiGrid(doc, input, contentWidth);
    doc.moveDown(0.8);

    // ---- Type-specific body ----------------------------------------------
    switch (input.type) {
      case 'council-briefing':
        sectionTopAlerts(doc, input.alerts, contentWidth);
        sectionPriorityActions(doc, input.actions, contentWidth);
        sectionGrantPipeline(doc, input.grant, contentWidth);
        break;
      case 'grant':
        sectionGrantPipeline(doc, input.grant, contentWidth, true);
        sectionPriorityActions(doc, input.actions, contentWidth);
        break;
      case 'climate':
        sectionEnvironment(doc, input.environment, contentWidth);
        sectionTopAlerts(
          doc,
          input.alerts.filter((a) =>
            ['Wildfire', 'Water', 'Drainage', 'Air', 'Flood'].some((k) =>
              a.category.toLowerCase().includes(k.toLowerCase()),
            ),
          ),
          contentWidth,
          'Climate-Linked Alerts',
        );
        sectionPriorityActions(doc, input.actions, contentWidth);
        break;
      case 'emergency-event':
        sectionTopAlerts(
          doc,
          input.alerts,
          contentWidth,
          'Active Incidents & Alerts',
        );
        sectionRiskBreakdown(doc, input.risk, contentWidth);
        sectionPriorityActions(doc, input.actions, contentWidth);
        break;
      case 'public-transparency':
        sectionRiskBreakdown(doc, input.risk, contentWidth);
        sectionGrantPipeline(doc, input.grant, contentWidth);
        sectionTopAlerts(
          doc,
          input.alerts,
          contentWidth,
          'Disclosed Open Alerts',
        );
        break;
      default:
        // department / infrastructure-condition primarily ship as XLSX, but a
        // PDF cover is still useful — show condition + risk overview.
        sectionRiskBreakdown(doc, input.risk, contentWidth);
        sectionRiskiestAssets(
          doc,
          input.riskiestAssets.slice(0, 12),
          contentWidth,
        );
        sectionPriorityActions(doc, input.actions, contentWidth);
        break;
    }

    drawFooters(doc, safe(input.tenant.name));
    doc.end();
  });
}

// ---- Drawing primitives -------------------------------------------------

function drawWordmark(doc: PDFKit.PDFDocument): void {
  const y = 36;
  doc.font('Helvetica-Bold').fontSize(18);
  doc.fillColor(INK).text('City', PAGE_MARGIN, y, { continued: true });
  doc.fillColor(ACCENT).text('PULSE', { continued: false });
}

function sectionTitle(doc: PDFKit.PDFDocument, label: string): void {
  ensureSpace(doc, 40);
  doc
    .fillColor(ACCENT)
    .font('Helvetica-Bold')
    .fontSize(13)
    .text(label.toUpperCase(), PAGE_MARGIN, doc.y);
  const y = doc.y + 2;
  doc
    .moveTo(PAGE_MARGIN, y)
    .lineTo(doc.page.width - PAGE_MARGIN, y)
    .strokeColor(HAIR)
    .lineWidth(1)
    .stroke();
  doc.moveDown(0.6);
  doc.fillColor(INK).font('Helvetica').fontSize(10);
}

function drawRiskBanner(
  doc: PDFKit.PDFDocument,
  tenant: TenantHeader,
  width: number,
): void {
  const h = 56;
  const x = PAGE_MARGIN;
  const y = doc.y;
  const color = riskColor(tenant.riskScore);
  doc.save();
  doc.roundedRect(x, y, width, h, 6).fill('#F2F6FB');
  doc.roundedRect(x, y, 6, h, 3).fill(color);
  doc
    .fillColor(INK)
    .font('Helvetica-Bold')
    .fontSize(28)
    .text(String(tenant.riskScore), x + 18, y + 12, { width: 70 });
  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(8)
    .text('CITY RISK SCORE', x + 18, y + 42, { width: 80 });
  doc
    .fillColor(color)
    .font('Helvetica-Bold')
    .fontSize(14)
    .text(tenant.riskLabel, x + 110, y + 16);
  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(9)
    .text(
      'Composite of asset condition, open alerts, 311 backlog and predicted failures.',
      x + 110,
      y + 34,
      { width: width - 130 },
    );
  doc.restore();
  doc.y = y + h;
}

function drawKpiGrid(
  doc: PDFKit.PDFDocument,
  input: PdfReportInput,
  width: number,
): void {
  const kpis: Array<{ label: string; value: string }> = [
    { label: 'Tracked Assets', value: input.counts.assets.toLocaleString() },
    { label: 'Open Alerts', value: String(input.counts.openAlerts) },
    { label: 'Critical Alerts', value: String(input.counts.criticalAlerts) },
    { label: 'Open 311', value: String(input.counts.open311) },
    {
      label: 'Active Work Orders',
      value: String(input.counts.activeWorkOrders),
    },
    { label: 'Grant Pipeline', value: money(input.grant.totalCost) },
  ];
  const cols = 3;
  const gap = 8;
  const cardW = (width - gap * (cols - 1)) / cols;
  const cardH = 46;
  const startX = PAGE_MARGIN;
  let y = doc.y;
  kpis.forEach((k, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    if (col === 0 && row > 0) y += cardH + gap;
    const x = startX + col * (cardW + gap);
    doc.save();
    doc.roundedRect(x, y, cardW, cardH, 5).fillAndStroke('#FFFFFF', HAIR);
    doc
      .fillColor(INK)
      .font('Helvetica-Bold')
      .fontSize(16)
      .text(k.value, x + 10, y + 8, { width: cardW - 20 });
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(8)
      .text(k.label.toUpperCase(), x + 10, y + 30, { width: cardW - 20 });
    doc.restore();
  });
  doc.y = y + cardH;
}

function sectionTopAlerts(
  doc: PDFKit.PDFDocument,
  alerts: AlertRow[],
  width: number,
  title = 'Top Alerts',
): void {
  sectionTitle(doc, title);
  if (alerts.length === 0) {
    doc.fillColor(MUTED).font('Helvetica-Oblique').text('No open alerts.');
    doc.moveDown(0.6);
    return;
  }
  const cols = [
    { label: 'SEV', w: 0.12 },
    { label: 'CATEGORY', w: 0.18 },
    { label: 'TITLE', w: 0.5 },
    { label: 'DEPARTMENT', w: 0.2 },
  ];
  tableHeader(doc, cols, width);
  for (const a of alerts) {
    const rowH = estimateRowHeight(doc, safe(a.title), cols[2].w * width - 8);
    ensureSpace(doc, rowH + 4);
    const y0 = doc.y;
    let x = PAGE_MARGIN;
    // SEV badge
    doc
      .fillColor(SEV_COLOR[a.severity] ?? MUTED)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(a.severity, x + 2, y0 + 1, { width: cols[0].w * width - 4 });
    x += cols[0].w * width;
    doc
      .fillColor(INK)
      .font('Helvetica')
      .fontSize(9)
      .text(safe(a.category), x, y0, { width: cols[1].w * width - 6 });
    x += cols[1].w * width;
    doc.text(safe(a.title), x, y0, { width: cols[2].w * width - 8 });
    x += cols[2].w * width;
    doc
      .fillColor(MUTED)
      .text(safe(a.department) || '—', x, y0, { width: cols[3].w * width - 4 });
    doc.y = y0 + rowH;
    hairline(doc, width);
  }
  doc.moveDown(0.5);
}

function sectionPriorityActions(
  doc: PDFKit.PDFDocument,
  actions: PriorityAction[],
  width: number,
): void {
  sectionTitle(doc, 'Priority Actions');
  actions.forEach((a, i) => {
    ensureSpace(doc, 28);
    const y0 = doc.y;
    doc
      .fillColor(
        SEV_COLOR[
          a.priority === 'HIGH'
            ? 'CRITICAL'
            : a.priority === 'MEDIUM'
              ? 'MEDIUM'
              : 'LOW'
        ],
      )
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(`${i + 1}. [${a.priority}]`, PAGE_MARGIN, y0, { width: 70 });
    doc
      .fillColor(INK)
      .font('Helvetica')
      .fontSize(10)
      .text(a.text, PAGE_MARGIN + 75, y0, { width: width - 75 - 90 });
    doc
      .fillColor(MUTED)
      .fontSize(8)
      .text(a.dept, PAGE_MARGIN + width - 90, y0, {
        width: 90,
        align: 'right',
      });
    doc.y = Math.max(doc.y, y0) + 4;
  });
  doc.moveDown(0.5);
}

function sectionGrantPipeline(
  doc: PDFKit.PDFDocument,
  grant: GrantSummary,
  width: number,
  detailed = false,
): void {
  sectionTitle(doc, 'Grant Pipeline');
  doc
    .fillColor(INK)
    .font('Helvetica')
    .fontSize(10)
    .text(
      `${grant.totalProjects} capital projects · Total ${money(grant.totalCost)} · ` +
        `Probability-weighted ${money(grant.expectedValue)} · Avg success ${pct(grant.avgProbability)}`,
      { width },
    );
  doc.moveDown(0.4);
  if (detailed && grant.projects.length > 0) {
    const cols = [
      { label: 'PROJECT', w: 0.42 },
      { label: 'PROGRAM', w: 0.18 },
      { label: 'COST', w: 0.14 },
      { label: 'MATCH', w: 0.12 },
      { label: 'P(WIN)', w: 0.14 },
    ];
    tableHeader(doc, cols, width);
    for (const p of grant.projects) {
      const rowH = estimateRowHeight(doc, safe(p.title), cols[0].w * width - 8);
      ensureSpace(doc, rowH + 4);
      const y0 = doc.y;
      let x = PAGE_MARGIN;
      doc
        .fillColor(INK)
        .font('Helvetica')
        .fontSize(9)
        .text(safe(p.title), x, y0, { width: cols[0].w * width - 8 });
      x += cols[0].w * width;
      doc.fillColor(MUTED).text(safe(p.grantProgram) || '—', x, y0, {
        width: cols[1].w * width - 4,
      });
      x += cols[1].w * width;
      doc
        .fillColor(INK)
        .text(money(p.cost), x, y0, { width: cols[2].w * width - 4 });
      x += cols[2].w * width;
      doc.text(safe(p.grantMatch) || '—', x, y0, {
        width: cols[3].w * width - 4,
      });
      x += cols[3].w * width;
      doc.text(p.probability != null ? pct(p.probability) : '—', x, y0, {
        width: cols[4].w * width - 4,
      });
      doc.y = y0 + rowH;
      hairline(doc, width);
    }
  }
  doc.moveDown(0.5);
}

function sectionRiskBreakdown(
  doc: PDFKit.PDFDocument,
  risk: RiskBreakdown,
  width: number,
): void {
  sectionTitle(doc, 'Asset Risk Distribution');
  const segs: Array<{ label: string; n: number; color: string }> = [
    { label: 'Critical', n: risk.critical, color: SEV_COLOR.CRITICAL },
    { label: 'Elevated', n: risk.elevated, color: SEV_COLOR.ELEVATED },
    { label: 'Watch', n: risk.watch, color: SEV_COLOR.WATCH },
    { label: 'OK', n: risk.ok, color: SEV_COLOR.OK },
  ];
  const total = risk.total || 1;
  // Stacked bar
  const barX = PAGE_MARGIN;
  const barY = doc.y;
  const barW = width;
  const barH = 16;
  let cx = barX;
  doc.save();
  segs.forEach((s) => {
    const w = (s.n / total) * barW;
    if (w > 0) doc.rect(cx, barY, w, barH).fill(s.color);
    cx += w;
  });
  doc.restore();
  doc.y = barY + barH + 6;
  // Legend
  segs.forEach((s) => {
    const y0 = doc.y;
    doc.save();
    doc.rect(PAGE_MARGIN, y0 + 1, 8, 8).fill(s.color);
    doc.restore();
    doc
      .fillColor(INK)
      .font('Helvetica')
      .fontSize(9)
      .text(
        `${s.label}: ${s.n.toLocaleString()} (${Math.round((s.n / total) * 100)}%)`,
        PAGE_MARGIN + 14,
        y0,
      );
  });
  doc.moveDown(0.6);
}

function sectionRiskiestAssets(
  doc: PDFKit.PDFDocument,
  assets: AssetRow[],
  width: number,
): void {
  sectionTitle(doc, 'Highest-Risk Assets');
  if (assets.length === 0) {
    doc.fillColor(MUTED).font('Helvetica-Oblique').text('No assets recorded.');
    doc.moveDown(0.6);
    return;
  }
  const cols = [
    { label: 'ASSET', w: 0.4 },
    { label: 'TYPE', w: 0.22 },
    { label: 'COND', w: 0.13 },
    { label: 'P(FAIL)', w: 0.13 },
    { label: 'RISK', w: 0.12 },
  ];
  tableHeader(doc, cols, width);
  for (const a of assets) {
    ensureSpace(doc, 16);
    const y0 = doc.y;
    let x = PAGE_MARGIN;
    doc
      .fillColor(INK)
      .font('Helvetica')
      .fontSize(9)
      .text(safe(a.name), x, y0, {
        width: cols[0].w * width - 6,
        ellipsis: true,
        height: 11,
      });
    x += cols[0].w * width;
    doc.fillColor(MUTED).text(a.type, x, y0, { width: cols[1].w * width - 4 });
    x += cols[1].w * width;
    doc.fillColor(INK).text(String(a.condition), x, y0, {
      width: cols[2].w * width - 4,
    });
    x += cols[2].w * width;
    doc.text(pct(a.failureProb), x, y0, { width: cols[3].w * width - 4 });
    x += cols[3].w * width;
    doc
      .fillColor(SEV_COLOR[a.riskLevel] ?? MUTED)
      .font('Helvetica-Bold')
      .text(a.riskLevel, x, y0, { width: cols[4].w * width - 4 });
    doc.y = y0 + 13;
    hairline(doc, width);
  }
  doc.moveDown(0.5);
}

function sectionEnvironment(
  doc: PDFKit.PDFDocument,
  readings: EnvReadingRow[],
  width: number,
): void {
  sectionTitle(doc, 'Environmental Readings');
  if (readings.length === 0) {
    doc
      .fillColor(MUTED)
      .font('Helvetica-Oblique')
      .text('No environmental readings on record for this tenant.');
    doc.moveDown(0.6);
    return;
  }
  const cols = [
    { label: 'METRIC', w: 0.45 },
    { label: 'VALUE', w: 0.25 },
    { label: 'DISTRICT', w: 0.3 },
  ];
  tableHeader(doc, cols, width);
  for (const r of readings) {
    ensureSpace(doc, 16);
    const y0 = doc.y;
    let x = PAGE_MARGIN;
    doc
      .fillColor(INK)
      .font('Helvetica')
      .fontSize(9)
      .text(safe(r.metric), x, y0, { width: cols[0].w * width - 6 });
    x += cols[0].w * width;
    doc.text(`${r.value}${r.unit ? ' ' + safe(r.unit) : ''}`, x, y0, {
      width: cols[1].w * width - 4,
    });
    x += cols[1].w * width;
    doc
      .fillColor(MUTED)
      .text(safe(r.district) || '—', x, y0, { width: cols[2].w * width - 4 });
    doc.y = y0 + 13;
    hairline(doc, width);
  }
  doc.moveDown(0.5);
}

// ---- low-level table + layout helpers -----------------------------------

function tableHeader(
  doc: PDFKit.PDFDocument,
  cols: Array<{ label: string; w: number }>,
  width: number,
): void {
  ensureSpace(doc, 18);
  const y0 = doc.y;
  let x = PAGE_MARGIN;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED);
  for (const c of cols) {
    doc.text(c.label, x, y0, { width: c.w * width - 4 });
    x += c.w * width;
  }
  doc.y = y0 + 12;
  doc
    .moveTo(PAGE_MARGIN, doc.y)
    .lineTo(doc.page.width - PAGE_MARGIN, doc.y)
    .strokeColor(HAIR)
    .lineWidth(0.8)
    .stroke();
  doc.y += 3;
}

function hairline(doc: PDFKit.PDFDocument, width: number): void {
  doc
    .moveTo(PAGE_MARGIN, doc.y)
    .lineTo(PAGE_MARGIN + width, doc.y)
    .strokeColor('#EEF2F6')
    .lineWidth(0.5)
    .stroke();
  doc.y += 3;
}

function estimateRowHeight(
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
): number {
  doc.font('Helvetica').fontSize(9);
  const h = doc.heightOfString(text, { width });
  return Math.max(13, h + 2);
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  const bottom = doc.page.height - PAGE_MARGIN - 24; // leave room for footer
  if (doc.y + needed > bottom) {
    doc.addPage();
  }
}

function drawFooters(doc: PDFKit.PDFDocument, tenantName: string): void {
  const range = doc.bufferedPageRange();
  const total = range.count;
  for (let i = range.start; i < range.start + total; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - PAGE_MARGIN + 6;
    doc
      .moveTo(PAGE_MARGIN, y - 4)
      .lineTo(doc.page.width - PAGE_MARGIN, y - 4)
      .strokeColor(HAIR)
      .lineWidth(0.5)
      .stroke();
    // lineBreak:false + explicit height stops pdfkit auto-adding a page when
    // text is drawn this close to the bottom margin.
    const opts: PDFKit.Mixins.TextOptions = {
      width: doc.page.width - PAGE_MARGIN * 2,
      lineBreak: false,
      height: 12,
    };
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(8)
      .text(`CityPULSE · ${tenantName} · Confidential`, PAGE_MARGIN, y, {
        ...opts,
        align: 'left',
      });
    doc.text(`Page ${i - range.start + 1} of ${total}`, PAGE_MARGIN, y, {
      ...opts,
      align: 'right',
    });
  }
}

function riskColor(score: number): string {
  if (score >= 75) return SEV_COLOR.CRITICAL;
  if (score >= 50) return SEV_COLOR.ELEVATED;
  if (score >= 25) return SEV_COLOR.WATCH;
  return SEV_COLOR.OK;
}
