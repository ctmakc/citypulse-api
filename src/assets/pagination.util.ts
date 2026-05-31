/**
 * Shared, backward-compatible cursor pagination helpers.
 *
 * Design contract (DO NOT break the frontend):
 *  - When the caller does NOT supply a `limit` query param, list endpoints keep
 *    returning a *plain array* exactly as before.
 *  - When `limit` IS supplied, list endpoints return a PaginatedResult envelope.
 *
 * The cursor is an opaque base64url token encoding the `createdAt` + `id` of the
 * last row of the page. Pairing createdAt with id makes the cursor stable and
 * total-ordered even when many rows share the same createdAt timestamp.
 *
 * This file intentionally exports only pure functions / types — it is NOT a Nest
 * provider, so importing it across module dirs introduces no DI coupling.
 */

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 500;

/** Envelope returned when the caller opts into pagination by passing `limit`. */
export interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
  total: number;
}

/** Decoded cursor payload: the sort key of the last row of the previous page. */
export interface CursorPayload {
  createdAt: string; // ISO timestamp
  id: string;
}

/**
 * Clamp an incoming limit into [1, MAX_PAGE_LIMIT].
 * `undefined` is returned untouched so callers can detect "no limit => array mode".
 */
export function clampLimit(
  limit: number | undefined,
  fallback: number = DEFAULT_PAGE_LIMIT,
): number {
  const n = limit === undefined || Number.isNaN(limit) ? fallback : limit;
  return Math.min(MAX_PAGE_LIMIT, Math.max(1, Math.trunc(n)));
}

/** Encode a row's sort key into an opaque cursor token. */
export function encodeCursor(row: { id: string; createdAt: Date }): string {
  const payload: CursorPayload = {
    createdAt: row.createdAt.toISOString(),
    id: row.id,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/** Decode an opaque cursor token. Returns null for missing/garbage input. */
export function decodeCursor(cursor?: string | null): CursorPayload | null {
  if (!cursor) return null;
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as Partial<CursorPayload>;
    if (
      parsed &&
      typeof parsed.id === 'string' &&
      typeof parsed.createdAt === 'string' &&
      !Number.isNaN(Date.parse(parsed.createdAt))
    ) {
      return { id: parsed.id, createdAt: parsed.createdAt };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Build a Prisma `where` fragment that selects rows strictly *after* the cursor
 * under a stable `createdAt DESC, id DESC` ordering (newest first).
 *
 * "After" a row R means: createdAt < R.createdAt, OR (createdAt == R.createdAt
 * AND id < R.id). Returns `{}` when there is no cursor.
 *
 * Merge into an existing where with: `{ ...baseWhere, ...cursorWhere(...) }`.
 */
export function cursorWhereDesc(
  cursor: CursorPayload | null,
): Record<string, unknown> {
  if (!cursor) return {};
  const at = new Date(cursor.createdAt);
  return {
    OR: [
      { createdAt: { lt: at } },
      { AND: [{ createdAt: at }, { id: { lt: cursor.id } }] },
    ],
  };
}

/**
 * Assemble a PaginatedResult from an over-fetched page.
 *
 * Fetch `limit + 1` rows: if you got the extra one, there is a next page.
 * `total` is the unfiltered-by-cursor count for the same base filter, supplied
 * by the caller (a single Prisma `count`).
 */
export function buildPage<T extends { id: string; createdAt: Date }>(
  rows: T[],
  limit: number,
  total: number,
): PaginatedResult<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data[data.length - 1];
  return {
    data,
    nextCursor: hasMore && last ? encodeCursor(last) : null,
    total,
  };
}
