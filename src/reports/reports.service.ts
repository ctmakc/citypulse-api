import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  StreamableFile,
} from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { ReportDataService } from './reports.data.js';
import { buildReportPdf } from './pdf-builder.js';
import { buildReportXlsx } from './xlsx-builder.js';
import {
  ARTIFACTS_DIR,
  GeneratedFile,
  GeneratedReport,
  REPORT_FORMATS,
  ReportFormat,
  ReportType,
  contentTypeFor,
  downloadUrlFor,
} from './reports.types.js';

/**
 * Reports module — generates real downloadable artifacts (PDF via pdfkit, XLSX
 * via exceljs) from live tenant data and serves them from a local directory.
 *
 * No headless browser is used: both builders are pure node.
 */
@Injectable()
export class ReportsService implements OnModuleInit {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly data: ReportDataService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureArtifactsDir();
  }

  private async ensureArtifactsDir(): Promise<void> {
    await mkdir(ARTIFACTS_DIR, { recursive: true });
  }

  /**
   * Build the artifact(s) for a report type from real Prisma data, write them
   * to the artifacts directory, and return their download descriptors.
   *
   * `generatedAt` is the ONLY non-deterministic value in the document body and
   * may be passed in (e.g. by the queue processor) so repeated calls are stable.
   */
  async generate(
    tenantId: string,
    type: ReportType,
    generatedAt: Date = new Date(),
  ): Promise<GeneratedReport> {
    await this.ensureArtifactsDir();

    const formats = REPORT_FORMATS[type];
    // Gather everything once; builders pick what they need per format.
    const [
      tenant,
      counts,
      alerts,
      actions,
      grant,
      risk,
      conditionAverages,
      riskiestAssets,
      environment,
      assets,
      workOrders,
      reports311,
    ] = await Promise.all([
      this.data.tenantHeader(tenantId),
      this.data.counts(tenantId),
      this.data.topAlerts(tenantId),
      this.data.priorityActions(tenantId),
      this.data.grantSummary(tenantId),
      this.data.riskBreakdown(tenantId),
      this.data.assetConditionAverages(tenantId),
      this.data.riskiestAssets(tenantId, 50),
      this.data.environmentSnapshot(tenantId),
      // XLSX-only payloads are only fetched when an XLSX is produced.
      formats.includes('xlsx')
        ? this.data.riskiestAssets(tenantId, 500)
        : Promise.resolve([]),
      formats.includes('xlsx')
        ? this.data.workOrders(tenantId, 500)
        : Promise.resolve([]),
      formats.includes('xlsx')
        ? this.data.reports311(tenantId, 500)
        : Promise.resolve([]),
    ]);

    const files: GeneratedFile[] = [];
    for (const format of formats) {
      let buffer: Buffer;
      if (format === 'pdf') {
        buffer = await buildReportPdf({
          type,
          tenant,
          generatedAt,
          counts,
          alerts,
          actions,
          grant,
          risk,
          conditionAverages,
          riskiestAssets,
          environment,
        });
      } else {
        buffer = await buildReportXlsx({
          type,
          tenant,
          generatedAt,
          assets,
          workOrders,
          reports311,
          grant,
          conditionAverages,
        });
      }
      const file = this.fileName(tenantId, type, format, generatedAt);
      const path = join(ARTIFACTS_DIR, file);
      await writeFile(path, buffer);
      files.push({
        file,
        format,
        url: downloadUrlFor(file),
        sizeBytes: buffer.length,
      });
      this.logger.log(
        `Wrote ${format.toUpperCase()} report ${file} (${buffer.length} bytes)`,
      );
    }

    return {
      ok: true,
      tenantId,
      type,
      generatedAt: generatedAt.toISOString(),
      files,
      url: files[0].url,
    };
  }

  /**
   * Resolve a previously generated artifact for streaming. Guards against path
   * traversal by stripping to the basename and confining to ARTIFACTS_DIR.
   */
  async openForDownload(requestedFile: string): Promise<{
    stream: StreamableFile;
    contentType: string;
    fileName: string;
    sizeBytes: number;
  }> {
    const safe = basename(requestedFile);
    if (!safe || safe.startsWith('.')) {
      throw new NotFoundException('Invalid file');
    }
    const path = join(ARTIFACTS_DIR, safe);
    let size: number;
    try {
      const s = await stat(path);
      if (!s.isFile()) throw new Error('not a file');
      size = s.size;
    } catch {
      throw new NotFoundException(`Report file ${safe} not found`);
    }
    const format: ReportFormat = safe.endsWith('.xlsx') ? 'xlsx' : 'pdf';
    const stream = new StreamableFile(createReadStream(path), {
      type: contentTypeFor(format),
      disposition: `attachment; filename="${safe}"`,
    });
    return {
      stream,
      contentType: contentTypeFor(format),
      fileName: safe,
      sizeBytes: size,
    };
  }

  /** Deterministic-ish filename: type + tenant + timestamp (ms) for uniqueness. */
  private fileName(
    tenantId: string,
    type: ReportType,
    format: ReportFormat,
    generatedAt: Date,
  ): string {
    const ts = generatedAt.toISOString().replace(/[:.]/g, '-');
    const tenantSlug = tenantId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    return `${type}_${tenantSlug}_${ts}.${format}`;
  }
}
