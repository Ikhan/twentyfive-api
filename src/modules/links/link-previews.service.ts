import { Inject, Injectable } from '@nestjs/common';
import type { LinkPreview } from './link-preview.types.js';
import { PAGE_FETCHER, type PageFetcher } from './page-fetcher.js';
import { parsePreview } from './parse-preview.js';
import { allowedUrl } from './safe-page-fetcher.js';

/** A found card is reused for 6 hours; a page with none is retried after 10 minutes. */
const FOUND_TTL_MS = 6 * 60 * 60_000;
const MISSING_TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 1000;

interface Entry {
  at: number;
  ttl: number;
  preview: Promise<LinkPreview | null>;
}

/**
 * Link cards for pages. Cached in memory, so typing a link in the composer and then posting it fetches the
 * page once (and concurrent requests for the same page share one fetch).
 */
@Injectable()
export class LinkPreviewsService {
  private readonly cache = new Map<string, Entry>();

  constructor(@Inject(PAGE_FETCHER) private readonly pages: PageFetcher) {}

  /** The card for `url`, or null if there isn't one (or the link isn't allowed). Never throws. */
  preview(url: string): Promise<LinkPreview | null> {
    const key = allowedUrl(url)?.href;
    if (!key) return Promise.resolve(null);
    const now = Date.now();
    const hit = this.cache.get(key);
    if (hit && now - hit.at < hit.ttl) return hit.preview;

    const preview = this.pages
      .fetchPage(key)
      .then((page) => (page ? parsePreview(page.html, page.url) : null))
      .catch(() => null);
    const entry: Entry = { at: now, ttl: MISSING_TTL_MS, preview };
    this.remember(key, entry);
    void preview.then((found) => {
      if (found && this.cache.get(key) === entry) this.cache.set(key, { ...entry, ttl: FOUND_TTL_MS });
    });
    return preview;
  }

  private remember(key: string, entry: Entry): void {
    this.cache.delete(key);
    this.cache.set(key, entry);
    // Oldest first (Map keeps insertion order).
    while (this.cache.size > MAX_ENTRIES) this.cache.delete(this.cache.keys().next().value!);
  }
}
