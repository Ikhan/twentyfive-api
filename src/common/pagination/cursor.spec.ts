import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ValidationError } from '../errors/app-error.js';
import { decodeCursor, encodeCursor, toPage } from './cursor.js';
import { PageQueryDto } from './page-query.dto.js';

const isKey = (v: unknown): v is { id: string } =>
  typeof v === 'object' && v !== null && typeof (v as { id?: unknown }).id === 'string';

describe('cursor pagination', () => {
  it('round-trips cursors and leaves an absent cursor undefined', () => {
    expect(decodeCursor(encodeCursor({ id: 'abc' }), isKey)).toEqual({ id: 'abc' });
    expect(decodeCursor(undefined, isKey)).toBeUndefined();
  });

  it('rejects garbage and wrongly shaped cursors with a 400', () => {
    expect(() => decodeCursor('%%%not-base64', isKey)).toThrow(ValidationError);
    expect(() => decodeCursor(encodeCursor({ nope: 1 }), isKey)).toThrow(ValidationError);
    expect(() => decodeCursor(Buffer.from('{bad json').toString('base64url'), isKey)).toThrow(ValidationError);
  });

  it('builds a page with a next cursor only when there are more rows', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const more = toPage(
      rows,
      2,
      (r) => r.id,
      (r) => ({ id: r.id }),
    );
    expect(more.items).toEqual(['a', 'b']);
    expect(decodeCursor(more.meta.nextCursor!, isKey)).toEqual({ id: 'b' });
    expect(
      toPage(
        rows,
        3,
        (r) => r.id,
        (r) => r,
      ).meta,
    ).toEqual({ nextCursor: null, limit: 3 });
    expect(
      toPage(
        [],
        5,
        (r) => r,
        (r) => r,
      ).meta.nextCursor,
    ).toBeNull();
  });

  it('PageQueryDto defaults to 20 and caps the limit at 50', async () => {
    expect(plainToInstance(PageQueryDto, {}).limit).toBe(20);
    const ok = plainToInstance(PageQueryDto, { limit: '10', cursor: 'abc' });
    expect(await validate(ok)).toEqual([]);
    expect(ok.limit).toBe(10);
    const errors = await validate(plainToInstance(PageQueryDto, { limit: '500' }));
    expect(errors.map((e) => e.property)).toEqual(['limit']);
  });
});
