/** An http(s) link in text, up to whitespace or a quote/angle bracket. */
const LINK = /\bhttps?:\/\/[^\s<>"'`]+/gi;
/** Sentence punctuation that usually follows a link rather than belonging to it. */
const TRAILING = /[.,!?;:'"]+$/;

/** The first http(s) link in `text`, cleaned of trailing punctuation, or null. */
export function firstLink(text: string): string | null {
  for (const [raw] of text.matchAll(LINK)) {
    let url = raw.replace(TRAILING, '');
    // "(see https://x.lk/a)": drop a closing bracket the link didn't open.
    if (url.endsWith(')') && !url.includes('(')) url = url.slice(0, -1);
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
    } catch {
      // Not a real URL; keep looking.
    }
  }
  return null;
}
