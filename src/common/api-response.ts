/** Shape of every JSON response. See ResponseEnvelopeInterceptor and AllExceptionsFilter. */
export interface ApiError {
  /** Stable, machine-readable code, e.g. NOT_FOUND, VALIDATION_FAILED. */
  code: string;
  /** Human-readable, safe to show to users. Never contains internals. */
  message: string;
  /** Optional structured detail, e.g. per-field validation messages. */
  details?: unknown;
}

export interface PageMeta {
  /** Opaque cursor for the next page, or null when there are no more items. */
  nextCursor: string | null;
  limit: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: ApiError | null;
  meta?: PageMeta;
}

/** Return this from a controller to send a list with pagination meta. */
export class Paginated<T> {
  constructor(
    readonly items: T[],
    readonly meta: PageMeta,
  ) {}
}
