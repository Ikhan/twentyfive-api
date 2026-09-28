import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import { Paginated, type ApiResponse } from '../api-response.js';

/** Wraps successful controller results in { success: true, data, error: null[, meta] }. */
@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<T, ApiResponse<unknown>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<unknown>> {
    return next
      .handle()
      .pipe(
        map((result) =>
          result instanceof Paginated
            ? { success: true, data: result.items, error: null, meta: result.meta }
            : { success: true, data: result ?? null, error: null },
        ),
      );
  }
}
