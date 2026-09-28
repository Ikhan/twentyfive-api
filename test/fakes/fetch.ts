import type { HttpFetch } from '../../src/modules/auth/oauth/oauth-http.js';

export interface RecordedCall {
  url: string;
  init?: RequestInit;
}

/** A fetch that replies with the queued JSON responses in order and records each call. */
export function scriptedFetch(...responses: { status?: number; body: unknown }[]): {
  http: HttpFetch;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const http = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    if (!next) throw new Error(`Unexpected request to ${String(url)}`);
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as HttpFetch;
  return { http, calls };
}
