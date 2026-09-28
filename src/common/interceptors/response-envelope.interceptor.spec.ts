import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { Paginated } from '../api-response.js';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor.js';

const wrap = (value: unknown) =>
  lastValueFrom(
    new ResponseEnvelopeInterceptor().intercept({} as ExecutionContext, { handle: () => of(value) } as CallHandler),
  );

describe('ResponseEnvelopeInterceptor', () => {
  it('wraps a plain result', async () => {
    await expect(wrap({ id: 'p1' })).resolves.toEqual({ success: true, data: { id: 'p1' }, error: null });
  });

  it('uses null data for empty results (e.g. 204-style actions)', async () => {
    await expect(wrap(undefined)).resolves.toEqual({ success: true, data: null, error: null });
  });

  it('lifts pagination meta out of Paginated results', async () => {
    const page = new Paginated([{ id: 'p1' }], { nextCursor: 'abc', limit: 20 });
    await expect(wrap(page)).resolves.toEqual({
      success: true,
      data: [{ id: 'p1' }],
      error: null,
      meta: { nextCursor: 'abc', limit: 20 },
    });
  });
});
