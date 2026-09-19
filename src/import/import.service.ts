import { Injectable, Logger } from '@nestjs/common';
import { Prisma, AssetType } from '@prisma/client';
import { parse as parseCsvSync } from 'csv-parse/sync';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_TENANT = 'meridian-tenant-id';
const CHUNK_SIZE = 1000;

/** Canonical column order for the CSV import + template. */
export const CSV_COLUMNS = [
  'externalId',
  'type',
  'name',
  'district',
  'department',
  'condition',
  'failureProb',
  'lat',
  'lng',
] as const;

const VALID_ASSET_TYPES = new Set<string>(Object.values(AssetType));

/** A row that has been normalized and is ready for createMany. */
interface PreparedAsset {
  tenantId: string;
  externalId: string | null;
  type: AssetType;
  name: string;
  district: string | null;
  department: string | null;
  condition: number;
  failureProb: number;
  locationLat: number | null;
  locationLng: number | null;
}

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: ImportRowError[];
}

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Public entry points
  // ---------------------------------------------------------------------------

  /**
   * Import assets from a CSV string. Parses defensively (never throws on a bad
   * row), validates + clamps every field, then bulk-inserts in chunks scoped to
   * the tenant and backfills the PostGIS `geom` column.
   */
  async importCsv(content: string, tenantId?: string): Promise<ImportResult> {
    const resolvedTenantId = tenantId || DEFAULT_TENANT;
    const errors: ImportRowError[] = [];
    const prepared: PreparedAsset[] = [];

    let records: Record<string, unknown>[] = [];
    try {
      records = parseCsvSync(content ?? '', {
        columns: (header: string[]) => header.map((h) => h.trim()),
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        bom: true,
      }) as Record<string, unknown>[];
    } catch (err) {
      // Whole-file parse failure (e.g. unbalanced quotes). Report and bail
      // gracefully rather than 500-ing.
      return {
        imported: 0,
        skipped: 0,
        errors: [
          {
            row: 0,
            message: `CSV could not be parsed: ${this.errMessage(err)}`,
          },
        ],
      };
    }

    records.forEach((raw, idx) => {
      // +2: 1 for the header line, 1 for 1-based row numbering.
      const rowNum = idx + 2;
      try {
        const asset = this.normalizeRow(raw, resolvedTenantId, (msg) => {
          throw new Error(msg);
        });
        prepared.push(asset);
      } catch (err) {
        errors.push({ row: rowNum, message: this.errMessage(err) });
      }
    });

    const imported = await this.bulkInsert(prepared, resolvedTenantId, errors);
    return {
      imported,
      skipped: records.length - imported,
      errors,
    };
  }

  /**
   * Import assets from a GeoJSON FeatureCollection of Point features. Each
   * feature's `properties` carry the same fields as the CSV columns; geometry
   * coordinates ([lng, lat]) win over any lat/lng in properties.
   */
  async importGeoJson(content: string, tenantId?: string): Promise<ImportResult> {
    const resolvedTenantId = tenantId || DEFAULT_TENANT;
    const errors: ImportRowError[] = [];
    const prepared: PreparedAsset[] = [];

    let doc: any;
    try {
      doc = typeof content === 'string' ? JSON.parse(content) : content;
    } catch (err) {
      return {
        imported: 0,
        skipped: 0,
        errors: [
          { row: 0, message: `GeoJSON could not be parsed: ${this.errMessage(err)}` },
        ],
      };
    }

    const features: any[] = Array.isArray(doc?.features)
      ? doc.features
      : Array.isArray(doc)
        ? doc
        : doc?.type === 'Feature'
          ? [doc]
          : [];

    if (features.length === 0) {
      return {
        imported: 0,
        skipped: 0,
        errors: [
          {
            row: 0,
            message:
              'No features found. Expected a GeoJSON FeatureCollection with a ' +
              'non-empty `features` array of Point features.',
          },
        ],
      };
    }

    features.forEach((feature, idx) => {
      const rowNum = idx + 1;
      try {
        const props =
          feature && typeof feature.properties === 'object' && feature.properties
            ? feature.properties
            : {};

        // Geometry coordinates take precedence over property lat/lng.
        let lat = props.lat ?? props.latitude;
        let lng = props.lng ?? props.lon ?? props.longitude;
        const geom = feature?.geometry;
        if (geom) {
          if (geom.type !== 'Point') {
            throw new Error(
              `unsupported geometry type "${geom.type}" (only Point is supported)`,
            );
          }
          const coords = geom.coordinates;
          if (Array.isArray(coords) && coords.length >= 2) {
            // GeoJSON order is [longitude, latitude].
            lng = coords[0];
            lat = coords[1];
          }
        }

        const merged = { ...props, lat, lng };
        const asset = this.normalizeRow(merged, resolvedTenantId, (msg) => {
          throw new Error(msg);
        });
        prepared.push(asset);
      } catch (err) {
        errors.push({ row: rowNum, message: this.errMessage(err) });
      }
    });

    const imported = await this.bulkInsert(prepared, resolvedTenantId, errors);
    return {
      imported,
      skipped: features.length - imported,
      errors,
    };
  }

  /** Sample CSV (header + 2 example rows) so users know the expected format. */
  template(): string {
    const header = CSV_COLUMNS.join(',');
    const rows = [
      'BRG-001,BRIDGE,Main St Overpass,Downtown,Public Works,72,0.18,40.7128,-74.006',
      'WM-2042,WATER_MAIN,5th Ave Trunk Main,Midtown,Water,55,0.41,40.7484,-73.9857',
    ];
    return [header, ...rows].join('\n') + '\n';
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Validate + clamp a single raw record into a PreparedAsset. Calls `fail`
   * (which throws) for any unrecoverable problem so the caller can record a
   * per-row error and continue.
   */
  private normalizeRow(
    raw: Record<string, unknown>,
    tenantId: string,
    fail: (msg: string) => never,
  ): PreparedAsset {
    const name = this.str(raw.name);
    if (!name) fail('missing required field "name"');

    const typeRaw = this.str(raw.type);
    if (!typeRaw) fail('missing required field "type"');
    const type = typeRaw.toUpperCase();
    if (!VALID_ASSET_TYPES.has(type)) {
      fail(
        `invalid asset type "${typeRaw}" (expected one of: ${[...VALID_ASSET_TYPES].join(', ')})`,
      );
    }

    const lat = this.clampOptional(raw.lat, -90, 90);
    const lng = this.clampOptional(raw.lng, -180, 180);
    // A single coordinate without its pair would produce a NULL geom anyway and
    // is almost always a data error; flag it instead of silently half-importing.
    if ((lat === null) !== (lng === null)) {
      fail('lat and lng must be provided together (or both omitted)');
    }

    return {
      tenantId,
      externalId: this.str(raw.externalId) || null,
      type: type as AssetType,
      name: name as string,
      district: this.str(raw.district) || null,
      department: this.str(raw.department) || null,
      // condition: integer 0..100 (defaults to 100, matching the schema).
      condition: Math.round(this.clamp(this.num(raw.condition, 100), 0, 100)),
      // failureProb: float 0..1 (defaults to 0).
      failureProb: this.clamp(this.num(raw.failureProb, 0), 0, 1),
      locationLat: lat,
      locationLng: lng,
    };
  }

  /**
   * Bulk-insert prepared rows in chunks, then backfill the PostGIS `geom`
   * column for the freshly-inserted rows of this tenant. Returns the number of
   * rows actually written. Any chunk-level failure is captured as a row error
   * (never thrown) so a single bad batch can't abort the whole import.
   */
  private async bulkInsert(
    prepared: PreparedAsset[],
    tenantId: string,
    errors: ImportRowError[],
  ): Promise<number> {
    if (prepared.length === 0) return 0;

    let imported = 0;
    const externalIds: string[] = [];

    for (let i = 0; i < prepared.length; i += CHUNK_SIZE) {
      const chunk = prepared.slice(i, i + CHUNK_SIZE);
      try {
        const res = await this.prisma.asset.createMany({ data: chunk });
        imported += res.count;
        for (const a of chunk) {
          if (a.externalId) externalIds.push(a.externalId);
        }
      } catch (err) {
        errors.push({
          row: 0,
          message: `bulk insert failed for rows ${i + 1}-${i + chunk.length}: ${this.errMessage(err)}`,
        });
      }
    }

    if (imported > 0) {
      await this.populateGeom(tenantId, externalIds);
    }
    return imported;
  }

  /**
   * Populate the PostGIS `geom` column for this tenant's rows that have
   * coordinates but no geometry yet. Scoped to externalIds from this import
   * when available (so we don't rescan the whole tenant); otherwise falls back
   * to all of the tenant's geom-less rows with coordinates.
   *
   * Failure here must not fail the import (rows are already inserted) — the
   * geom can be backfilled later — so we swallow + log.
   */
  private async populateGeom(tenantId: string, externalIds: string[]): Promise<void> {
    try {
      if (externalIds.length > 0) {
        await this.prisma.$executeRaw(Prisma.sql`
          UPDATE "Asset"
          SET geom = ST_SetSRID(ST_MakePoint("locationLng", "locationLat"), 4326)
          WHERE "tenantId" = ${tenantId}
            AND "locationLat" IS NOT NULL
            AND "locationLng" IS NOT NULL
            AND geom IS NULL
            AND "externalId" IN (${Prisma.join(externalIds)})
        `);
      } else {
        await this.prisma.$executeRaw(Prisma.sql`
          UPDATE "Asset"
          SET geom = ST_SetSRID(ST_MakePoint("locationLng", "locationLat"), 4326)
          WHERE "tenantId" = ${tenantId}
            AND "locationLat" IS NOT NULL
            AND "locationLng" IS NOT NULL
            AND geom IS NULL
        `);
      }
    } catch (err) {
      this.logger.warn(
        `geom backfill skipped for tenant ${tenantId}: ${this.errMessage(err)}`,
      );
    }
  }

  // ---- value coercion helpers ----

  private str(v: unknown): string {
    if (v === null || v === undefined) return '';
    return String(v).trim();
  }

  /** Parse to a finite number, falling back to `fallback` when blank/invalid. */
  private num(v: unknown, fallback: number): number {
    if (v === null || v === undefined || v === '') return fallback;
    const n = typeof v === 'number' ? v : Number(String(v).trim());
    return Number.isFinite(n) ? n : fallback;
  }

  private clamp(n: number, min: number, max: number): number {
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  /**
   * Parse an optional coordinate: blank/missing => null; invalid => null;
   * otherwise clamped into [min, max].
   */
  private clampOptional(v: unknown, min: number, max: number): number | null {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).trim());
    if (!Number.isFinite(n)) return null;
    return this.clamp(n, min, max);
  }

  private errMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
  }
}
