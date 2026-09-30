/** What a link card shows: from the page's Open Graph / Twitter tags, or its <title>. */
export interface LinkPreview {
  /** The page's own address (after redirects), which the card opens. */
  url: string;
  title: string;
  description: string | null;
  /** An https image for the card, or null. */
  image: string | null;
  /** og:site_name, or the host without "www.". */
  siteName: string;
}
