import ExcelJS from 'exceljs';
import type {
  TenantHeader,
  AssetRow,
  WorkOrderRow,
  Report311Row,
  GrantSummary,
} from './reports.data.js';
import { REPORT_TITLES, type ReportType } from './reports.types.js';

const BRAND_FILL = 'FF0B1F33'; // ink
const ACCENT_FILL = 'FF1E6FD9'; // accent
const HEADER_TEXT = 'FFFFFFFF';

export interface XlsxReportInput {
  type: ReportType;
  tenant: TenantHeader;
  generatedAt: Date;
  assets: AssetRow[];
  workOrders: WorkOrderRow[];
  reports311: Report311Row[];
  grant: GrantSummary;
  conditionAverages: { avgCondition: number; avgFailureProb: number };
}

/**
 * Build a CityPULSE workbook with styled sheets populated from real tenant
 * data. Returns an XLSX Buffer (pure node via exceljs — no headless browser).
 */
export async function buildReportXlsx(input: XlsxReportInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CityPULSE';
  wb.created = input.generatedAt;
  wb.title = `${REPORT_TITLES[input.type]} — ${input.tenant.name}`;

  buildSummarySheet(wb, input);

  if (input.type === 'grant') {
    buildGrantSheet(wb, input.grant);
  }

  // Department + infrastructure-condition (and any XLSX export) get the full
  // operational worksheet set.
  buildAssetsSheet(wb, input.assets);
  buildWorkOrdersSheet(wb, input.workOrders);
  buildReports311Sheet(wb, input.reports311);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

// ---- Sheets -------------------------------------------------------------

function buildSummarySheet(wb: ExcelJS.Workbook, input: XlsxReportInput): void {
  const ws = wb.addWorksheet('Summary', {
    properties: { tabColor: { argb: ACCENT_FILL } },
  });
  ws.columns = [{ width: 28 }, { width: 48 }];

  // Wordmark / title band
  ws.mergeCells('A1:B1');
  const title = ws.getCell('A1');
  title.value = 'CityPULSE';
  title.font = {
    name: 'Calibri',
    size: 20,
    bold: true,
    color: { argb: HEADER_TEXT },
  };
  title.alignment = { vertical: 'middle' };
  ws.getRow(1).height = 30;
  fillCell(title, BRAND_FILL);

  ws.mergeCells('A2:B2');
  const sub = ws.getCell('A2');
  sub.value = REPORT_TITLES[input.type];
  sub.font = { size: 13, bold: true, color: { argb: HEADER_TEXT } };
  fillCell(sub, ACCENT_FILL);
  ws.getRow(2).height = 20;

  const rows: Array<[string, string | number]> = [
    ['Tenant', input.tenant.name],
    ['Type', input.tenant.type],
    ['Country', input.tenant.country],
    ['Population', input.tenant.population ?? 'n/a'],
    [
      'City Risk Score',
      `${input.tenant.riskScore} (${input.tenant.riskLabel})`,
    ],
    ['Avg Asset Condition', input.conditionAverages.avgCondition],
    [
      'Avg Failure Probability',
      `${Math.round(input.conditionAverages.avgFailureProb * 100)}%`,
    ],
    ['Tracked Assets', input.assets.length],
    ['Work Orders (this export)', input.workOrders.length],
    ['311 Reports (this export)', input.reports311.length],
    ['Grant Pipeline Total', input.grant.totalCost],
    [
      'Generated (UTC)',
      input.generatedAt.toISOString().slice(0, 19).replace('T', ' '),
    ],
  ];
  let r = 4;
  for (const [k, v] of rows) {
    const kc = ws.getCell(`A${r}`);
    const vc = ws.getCell(`B${r}`);
    kc.value = k;
    kc.font = { bold: true, color: { argb: 'FF5B6B7B' } };
    vc.value = v;
    if (k === 'Grant Pipeline Total' && typeof v === 'number') {
      vc.numFmt = '$#,##0';
    }
    r += 1;
  }
}

function buildAssetsSheet(wb: ExcelJS.Workbook, assets: AssetRow[]): void {
  const ws = wb.addWorksheet('Assets');
  const cols: ExcelJS.Column[] = [
    { header: 'Asset', key: 'name', width: 34 },
    { header: 'Type', key: 'type', width: 18 },
    { header: 'District', key: 'district', width: 16 },
    { header: 'Department', key: 'department', width: 20 },
    { header: 'Condition', key: 'condition', width: 12 },
    { header: 'Failure Prob', key: 'failureProb', width: 14 },
    { header: 'Risk Level', key: 'riskLevel', width: 14 },
    { header: 'Replacement Cost', key: 'replacementCost', width: 18 },
  ] as ExcelJS.Column[];
  ws.columns = cols;
  styleHeaderRow(ws);
  for (const a of assets) {
    ws.addRow({
      name: a.name,
      type: a.type,
      district: a.district ?? '',
      department: a.department ?? '',
      condition: a.condition,
      failureProb: a.failureProb,
      riskLevel: a.riskLevel,
      replacementCost: a.replacementCost ?? null,
    });
  }
  ws.getColumn('failureProb').numFmt = '0%';
  ws.getColumn('replacementCost').numFmt = '$#,##0';
  colorByRisk(ws, 'riskLevel');
  ws.autoFilter = 'A1:H1';
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function buildWorkOrdersSheet(
  wb: ExcelJS.Workbook,
  workOrders: WorkOrderRow[],
): void {
  const ws = wb.addWorksheet('Work Orders');
  ws.columns = [
    { header: 'Title', key: 'title', width: 40 },
    { header: 'Department', key: 'department', width: 20 },
    { header: 'Priority', key: 'priority', width: 12 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Assignee', key: 'assignee', width: 20 },
    { header: 'Due Date', key: 'dueDate', width: 14 },
  ] as ExcelJS.Column[];
  styleHeaderRow(ws);
  for (const w of workOrders) {
    ws.addRow({
      title: w.title,
      department: w.department ?? '',
      priority: w.priority,
      status: w.status,
      assignee: w.assignee ?? '',
      dueDate: w.dueDate ?? '',
    });
  }
  ws.autoFilter = 'A1:F1';
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function buildReports311Sheet(
  wb: ExcelJS.Workbook,
  reports: Report311Row[],
): void {
  const ws = wb.addWorksheet('311 Reports');
  ws.columns = [
    { header: 'Category', key: 'category', width: 24 },
    { header: 'Severity', key: 'severity', width: 12 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Location', key: 'location', width: 30 },
    { header: 'Department', key: 'department', width: 20 },
    { header: 'Created', key: 'createdAt', width: 14 },
  ] as ExcelJS.Column[];
  styleHeaderRow(ws);
  for (const rpt of reports) {
    ws.addRow({
      category: rpt.category,
      severity: rpt.severity,
      status: rpt.status,
      location: rpt.location,
      department: rpt.department ?? '',
      createdAt: rpt.createdAt,
    });
  }
  ws.autoFilter = 'A1:F1';
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function buildGrantSheet(wb: ExcelJS.Workbook, grant: GrantSummary): void {
  const ws = wb.addWorksheet('Grant Pipeline', {
    properties: { tabColor: { argb: ACCENT_FILL } },
  });
  ws.columns = [
    { header: 'Project', key: 'title', width: 42 },
    { header: 'Program', key: 'grantProgram', width: 18 },
    { header: 'Eligibility', key: 'grantEligibility', width: 16 },
    { header: 'Cost', key: 'cost', width: 16 },
    { header: 'Match', key: 'grantMatch', width: 10 },
    { header: 'P(Win)', key: 'probability', width: 10 },
    { header: 'Expected Value', key: 'expected', width: 18 },
    { header: 'Urgency', key: 'urgency', width: 12 },
    { header: 'Status', key: 'status', width: 14 },
  ] as ExcelJS.Column[];
  styleHeaderRow(ws);
  for (const p of grant.projects) {
    ws.addRow({
      title: p.title,
      grantProgram: p.grantProgram ?? '',
      grantEligibility: p.grantEligibility ?? '',
      cost: p.cost,
      grantMatch: p.grantMatch ?? '',
      probability: p.probability ?? null,
      expected: p.probability != null ? p.cost * p.probability : null,
      urgency: p.urgency ?? '',
      status: p.status,
    });
  }
  // Totals row
  const totalRow = ws.addRow({
    title: 'TOTAL',
    cost: grant.totalCost,
    probability: grant.avgProbability,
    expected: grant.expectedValue,
  });
  totalRow.font = { bold: true };
  totalRow.eachCell((cell) => {
    cell.border = { top: { style: 'thin', color: { argb: 'FF0B1F33' } } };
  });
  ws.getColumn('cost').numFmt = '$#,##0';
  ws.getColumn('expected').numFmt = '$#,##0';
  ws.getColumn('probability').numFmt = '0%';
  ws.autoFilter = 'A1:I1';
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// ---- Styling helpers ----------------------------------------------------

function styleHeaderRow(ws: ExcelJS.Worksheet): void {
  const header = ws.getRow(1);
  header.height = 20;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_TEXT }, size: 11 };
    fillCell(cell, BRAND_FILL);
    cell.alignment = { vertical: 'middle' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF1E6FD9' } },
    };
  });
}

function fillCell(cell: ExcelJS.Cell, argb: string): void {
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb },
  };
}

function colorByRisk(ws: ExcelJS.Worksheet, columnKey: string): void {
  const colors: Record<string, string> = {
    CRITICAL: 'FFFADBD8',
    ELEVATED: 'FFFDEBD0',
    WATCH: 'FFFCF3CF',
    OK: 'FFD5F5E3',
  };
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cell = row.getCell(columnKey);
    const key = typeof cell.value === 'string' ? cell.value : '';
    const argb = colors[key];
    if (argb) fillCell(cell, argb);
  });
}
