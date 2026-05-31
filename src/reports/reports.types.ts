import { join } from 'node:path';

/**
 * The seven report types the platform can produce. These mirror the report
 * cards in the CityPULSE design (Reports view).
 */
export const REPORT_TYPES = [
  'council-briefing',
  'department',
  'grant',
  'climate',
  'infrastructure-condition',
  'emergency-event',
  'public-transparency',
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export type ReportFormat = 'pdf' | 'xlsx';

export function isReportType(value: string): value is ReportType {
  return (REPORT_TYPES as readonly string[]).includes(value);
}

/**
 * Format(s) each report type renders into.
 *
 *  - Narrative / executive reports → PDF (council, climate, emergency,
 *    public-transparency).
 *  - Data / tabular reports → XLSX (department, infrastructure-condition).
 *  - grant → BOTH (the design's grant card shows a PDF + XLSX badge: a written
 *    pipeline summary plus the underlying project worksheet).
 */
export const REPORT_FORMATS: Record<ReportType, ReportFormat[]> = {
  'council-briefing': ['pdf'],
  department: ['xlsx'],
  grant: ['pdf', 'xlsx'],
  climate: ['pdf'],
  'infrastructure-condition': ['xlsx'],
  'emergency-event': ['pdf'],
  'public-transparency': ['pdf'],
};

/** Human-friendly title used in document headers + filenames. */
export const REPORT_TITLES: Record<ReportType, string> = {
  'council-briefing': 'Council Briefing',
  department: 'Department Operations Report',
  grant: 'Grant Pipeline Report',
  climate: 'Climate & Environment Briefing',
  'infrastructure-condition': 'Infrastructure Condition Report',
  'emergency-event': 'Emergency Event Briefing',
  'public-transparency': 'Public Transparency Report',
};

/** Absolute directory where generated artifacts are written and served from. */
export const ARTIFACTS_DIR = join(process.cwd(), 'artifacts');

/** One produced file on disk, exposed to callers via a download URL. */
export interface GeneratedFile {
  /** Bare filename (also the :file path param for the download endpoint). */
  file: string;
  format: ReportFormat;
  /** Relative API path to download this file (already prefixed with api/v1). */
  url: string;
  sizeBytes: number;
}

/** Result of a full generate() call — one report can yield 1+ files. */
export interface GeneratedReport {
  ok: true;
  tenantId: string;
  type: ReportType;
  generatedAt: string;
  files: GeneratedFile[];
  /** Convenience: the primary (first) file's download URL. */
  url: string;
}

export const DOWNLOAD_BASE_PATH = '/api/v1/reports/download';

export function downloadUrlFor(file: string): string {
  return `${DOWNLOAD_BASE_PATH}/${encodeURIComponent(file)}`;
}

export function contentTypeFor(format: ReportFormat): string {
  return format === 'pdf'
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}
