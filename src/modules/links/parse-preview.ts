import { Parser } from 'htmlparser2';
import type { LinkPreview } from './link-preview.types.js';

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 300;

const clean = (text: string | undefined, max: number): string | null => {
  const t = text?.replace(/\s+/g, ' ').trim();
  return t ? (t.length > max ? `${t.slice(0, max - 1)}…` : t) : null;
};

/** Only https images (http would be blocked as mixed content), resolved against the page. */
function imageUrl(src: string | undefined, pageUrl: string): string | null {
  if (!src) return null;
  try {
    const url = new URL(src.trim(), pageUrl);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Reads a page's card details from its <head>. Null when it has no title at all. */
export function parsePreview(html: string, pageUrl: string): LinkPreview | null {
  const meta = new Map<string, string>();
  let title = '';
  let inTitle = false;
  const parser = new Parser(
    {
      onopentag(name, attrs) {
        if (name === 'title') inTitle = true;
        if (name !== 'meta') return;
        // og:* uses property=, twitter:* and description use name=. The first of each wins.
        const key = (attrs.property ?? attrs.name)?.toLowerCase();
        if (key && attrs.content !== undefined && !meta.has(key)) meta.set(key, attrs.content);
      },
      ontext(text) {
        if (inTitle) title += text;
      },
      onclosetag(name) {
        if (name === 'title') inTitle = false;
        // Everything a card needs is in <head>.
        if (name === 'head') parser.pause();
      },
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();

  const heading = clean(meta.get('og:title') ?? meta.get('twitter:title') ?? title, MAX_TITLE);
  if (!heading) return null;
  const host = new URL(pageUrl).hostname.replace(/^www\./, '');
  return {
    url: pageUrl,
    title: heading,
    description: clean(
      meta.get('og:description') ?? meta.get('twitter:description') ?? meta.get('description'),
      MAX_DESCRIPTION,
    ),
    image: imageUrl(
      meta.get('og:image') ?? meta.get('og:image:url') ?? meta.get('twitter:image') ?? meta.get('twitter:image:src'),
      pageUrl,
    ),
    siteName: clean(meta.get('og:site_name'), 80) ?? host,
  };
}
