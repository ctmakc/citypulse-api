import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ImportService, ImportResult } from './import.service';
import { ImportAssetsDto } from './dto/import-assets.dto';

@ApiTags('import')
@Controller('import')
export class ImportController {
  constructor(private readonly service: ImportService) {}

  /**
   * Bulk-import assets. Accepts EITHER:
   *  - a multipart file upload (field name `file`) of a `.csv` or `.geojson`
   *    file, OR
   *  - a JSON body `{ format: 'csv'|'geojson', content: string }`.
   *
   * Returns { imported, skipped, errors } and never 500s on bad rows — each
   * malformed row is collected into `errors` and the rest continue.
   */
  @Post('assets')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Import assets from a CSV/GeoJSON file upload, or an inline JSON payload.',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    description:
      'Either a multipart `file` (CSV/GeoJSON), or a JSON body ' +
      '{ format, content }.',
    schema: {
      oneOf: [
        {
          type: 'object',
          properties: { file: { type: 'string', format: 'binary' } },
        },
        {
          type: 'object',
          properties: {
            format: { type: 'string', enum: ['csv', 'geojson'] },
            content: { type: 'string' },
          },
          required: ['format', 'content'],
        },
      ],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async importAssets(
    @Request() req: any,
    @UploadedFile() file?: Express.Multer.File,
    @Body() body?: Partial<ImportAssetsDto>,
  ): Promise<ImportResult> {
    const tenantId: string | undefined = req.user?.tenantId;

    // ---- Path 1: multipart file upload ----
    if (file && file.buffer) {
      const content = file.buffer.toString('utf-8');
      const format = this.detectFileFormat(file, content);
      return format === 'geojson'
        ? this.service.importGeoJson(content, tenantId)
        : this.service.importCsv(content, tenantId);
    }

    // ---- Path 2: inline JSON body ----
    const format = body?.format;
    const content = body?.content;
    if (!format || typeof content !== 'string') {
      throw new BadRequestException(
        'Provide either a multipart `file` upload, or a JSON body with ' +
          '`format` ("csv" | "geojson") and string `content`.',
      );
    }
    if (format !== 'csv' && format !== 'geojson') {
      throw new BadRequestException(
        `Unsupported format "${format}". Expected "csv" or "geojson".`,
      );
    }

    return format === 'geojson'
      ? this.service.importGeoJson(content, tenantId)
      : this.service.importCsv(content, tenantId);
  }

  /**
   * Sample CSV (header + example rows) so callers know the expected import
   * format. Served as text/csv.
   */
  @Get('template')
  @ApiOperation({ summary: 'Download a sample CSV template for asset import.' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="asset-import-template.csv"')
  template(): string {
    return this.service.template();
  }

  // ---------------------------------------------------------------------------

  /**
   * Decide whether an uploaded file is GeoJSON or CSV from its name, mimetype,
   * and a quick sniff of the content (so an extensionless upload still works).
   */
  private detectFileFormat(
    file: Express.Multer.File,
    content: string,
  ): 'csv' | 'geojson' {
    const name = (file.originalname || '').toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();

    if (name.endsWith('.geojson') || name.endsWith('.json')) return 'geojson';
    if (name.endsWith('.csv')) return 'csv';
    if (mime.includes('geo+json') || mime.includes('json')) return 'geojson';
    if (mime.includes('csv')) return 'csv';

    // Content sniff: GeoJSON starts with `{` and mentions FeatureCollection.
    const head = content.trimStart().slice(0, 256);
    if (head.startsWith('{') || head.startsWith('[')) return 'geojson';
    return 'csv';
  }
}
