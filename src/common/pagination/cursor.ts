import { Paginated } from '../api-response.js';
import { ValidationError } from '../errors/app-error.js';

/** Cursors are opaque to clients: base64url-encoded JSON of the last item's sort key. */
export function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** Decodes a cursor and checks its shape; bad or tampered cursors are a 400, not a 500. */
export function decodeCursor<T>(cursor: string | undefined, isValid: (value: unknown) => value is T): T | undefined {
  if (cursor === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (isValid(value)) return value;
  } catch {
    // fall through
  }
  throw new ValidationError('Invalid cursor.', { field: 'cursor' });
}

/**
 * Builds a page from `limit + 1` fetched rows: the extra row only signals that there's more.
 * `keyOf` turns the last returned item into the next cursor's value.
 */
export function toPage<Row, Item>(
  rows: Row[],
  limit: number,
  map: (row: Row) => Item,
  keyOf: (row: Row) => unknown,
): Paginated<Item> {
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows.at(-1);
  return new Paginated(pageRows.map(map), {
    nextCursor: hasMore && last !== undefined ? encodeCursor(keyOf(last)) : null,
    limit,
  });
}
