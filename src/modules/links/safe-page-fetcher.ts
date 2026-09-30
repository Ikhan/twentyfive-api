import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import type { LookupFunction } from 'node:net';
import { Inject, Injectable, Logger, Optional, type OnModuleDestroy } from '@nestjs/common';
import { Agent, request, type Dispatcher } from 'undici';
import { PAGE_DISPATCHER, type FetchedPage, type PageFetcher } from './page-fetcher.js';
import { isIpLiteral, isPublicAddress } from './public-address.js';

const MAX_REDIRECTS = 3;
/** The whole fetch, redirects included. */
const TOTAL_TIMEOUT_MS = 5000;
/** A card only needs <head>; stop reading after this much. */
const MAX_BYTES = 512 * 1024;
const HEADERS = {
  'user-agent': 'Mozilla/5.0 (compatible; twentyfivebot/1.0; +https://twentyfive.lk)',
  accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
  'accept-language': 'en',
};

/** A URL we're willing to request: http(s) on the normal ports, no credentials, not a private IP. */
export function allowedUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.port !== '' && url.port !== '80' && url.port !== '443') return null;
  // IP literals skip DNS, so check them here; names are checked when they resolve (safeLookup).
  if (isIpLiteral(url.hostname) && !isPublicAddress(url.hostname)) return null;
  url.hash = '';
  return url;
}

export class BlockedAddressError extends Error {
  constructor(hostname: string) {
    super(`${hostname} resolves to a non-public address`);
  }
}

/**
 * DNS lookup for outgoing connections that refuses non-public addresses. It runs at connect time, so a
 * name can't pass a check and then resolve somewhere private (DNS rebinding).
 */
export const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    const list = addresses as unknown as LookupAddress[];
    if (error) return callback(error, '', 0);
    if (list.length === 0 || list.some((a) => !isPublicAddress(a.address))) {
      return callback(new BlockedAddressError(hostname), '', 0);
    }
    if (options.all) return (callback as unknown as (e: null, all: LookupAddress[]) => void)(null, list);
    return callback(null, list[0]!.address, list[0]!.family);
  });
};

const header = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/** Fetches pages for link cards without letting links reach private networks (SSRF). */
@Injectable()
export class SafePageFetcher implements PageFetcher, OnModuleDestroy {
  private readonly logger = new Logger(SafePageFetcher.name);
  private readonly dispatcher: Dispatcher;

  constructor(@Optional() @Inject(PAGE_DISPATCHER) dispatcher?: Dispatcher) {
    this.dispatcher =
      dispatcher ??
      new Agent({ connect: { lookup: safeLookup, timeout: 3000 }, headersTimeout: 4000, bodyTimeout: 4000 });
  }

  async onModuleDestroy(): Promise<void> {
    await this.dispatcher.close();
  }

  async fetchPage(start: string): Promise<FetchedPage | null> {
    const signal = AbortSignal.timeout(TOTAL_TIMEOUT_MS);
    let next = start;
    try {
      // Redirects are followed by hand so every hop is checked again.
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const url = allowedUrl(next);
        if (!url) return null;
        const res = await request(url, { dispatcher: this.dispatcher, method: 'GET', headers: HEADERS, signal });
        if (res.statusCode >= 300 && res.statusCode < 400) {
          await res.body.dump();
          const location = header(res.headers.location);
          if (!location) return null;
          next = new URL(location, url).href;
          continue;
        }
        const type = header(res.headers['content-type']) ?? '';
        if (res.statusCode < 200 || res.statusCode >= 300 || !/text\/html|application\/xhtml\+xml/i.test(type)) {
          await res.body.dump();
          return null;
        }
        return { url: url.href, html: await readCapped(res.body, MAX_BYTES) };
      }
      return null;
    } catch (error) {
      this.logger.debug(`No preview for ${start}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
}

/** The body as text, stopping (and closing the connection) after `max` bytes. */
async function readCapped(body: Dispatcher.ResponseData['body'], max: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of body) {
    const buffer = Buffer.from(chunk as Uint8Array);
    chunks.push(buffer);
    size += buffer.length;
    if (size >= max) {
      body.destroy();
      break;
    }
  }
  return Buffer.concat(chunks).subarray(0, max).toString('utf8');
}
