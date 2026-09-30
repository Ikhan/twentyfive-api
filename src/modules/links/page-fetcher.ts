/** A web page's HTML, fetched for a link card. */
export interface FetchedPage {
  /** Where it was found, after redirects. */
  url: string;
  html: string;
}

export interface PageFetcher {
  /** The page at `url`, or null if it's not allowed, not HTML, or can't be fetched in time. Never throws. */
  fetchPage(url: string): Promise<FetchedPage | null>;
}

export const PAGE_FETCHER = Symbol('PAGE_FETCHER');
/** Lets tests swap the HTTP dispatcher (e.g. undici's MockAgent). */
export const PAGE_DISPATCHER = Symbol('PAGE_DISPATCHER');
