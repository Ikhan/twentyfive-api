import type { ExecutionContext } from '@nestjs/common';

export interface FakeRequest {
  method?: string;
  headers?: Record<string, string | undefined>;
  cookies?: Record<string, string | undefined>;
  user?: { id: string };
}

/** Minimal ExecutionContext around a fake request, for guard and decorator tests. */
export function httpContext(
  request: FakeRequest,
  handler: () => void = () => undefined,
  cls: object = class {},
): ExecutionContext {
  const req = { method: 'GET', headers: {}, cookies: {}, ...request };
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
    getHandler: () => handler,
    getClass: () => cls,
  } as unknown as ExecutionContext;
}
