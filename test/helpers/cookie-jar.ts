import type { Response } from 'supertest';

/** Minimal browser-like cookie jar for e2e tests (ignores paths/expiry except for deletions). */
export class CookieJar {
  private readonly cookies = new Map<string, string>();

  /** Stores Set-Cookie headers from a response; cleared cookies are removed. */
  update(res: Response): this {
    const header = res.headers['set-cookie'] as unknown as string[] | string | undefined;
    for (const raw of Array.isArray(header) ? header : header ? [header] : []) {
      const [pair, ...attributes] = raw.split(';');
      const eq = pair!.indexOf('=');
      const name = pair!.slice(0, eq).trim();
      const value = decodeURIComponent(pair!.slice(eq + 1).trim());
      const expired = attributes.some((a) => /expires=thu, 01 jan 1970/i.test(a.trim()));
      if (expired || value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return this;
  }

  get(name: string): string | undefined {
    return this.cookies.get(name);
  }

  set(name: string, value: string): void {
    this.cookies.set(name, value);
  }

  delete(name: string): void {
    this.cookies.delete(name);
  }

  /** Value for the Cookie request header. */
  header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');
  }
}
