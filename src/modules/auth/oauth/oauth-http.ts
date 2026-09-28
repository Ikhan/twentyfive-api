import { UnauthorizedError } from '../../../common/errors/app-error.js';

/** Injected so providers can be tested without real network calls. */
export type HttpFetch = typeof fetch;

/** Raised when a provider rejects the code or returns something unexpected. */
export class OAuthError extends UnauthorizedError {}

/** GET/POST JSON from a provider, turning any failure into an OAuthError. */
export async function requestJson<T>(http: HttpFetch, provider: string, url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await http(url, { ...init, headers: { Accept: 'application/json', ...init?.headers } });
  } catch {
    throw new OAuthError(`Couldn’t reach ${provider}. Please try again.`);
  }
  if (!response.ok) throw new OAuthError(`${provider} sign-in failed.`, { status: response.status });
  return (await response.json()) as T;
}

export function formBody(values: Record<string, string>): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values).toString(),
  };
}
