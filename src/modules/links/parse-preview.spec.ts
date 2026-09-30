import { parsePreview } from './parse-preview.js';

describe('parsePreview', () => {
  it('reads Open Graph tags, resolving the image against the page', () => {
    const html = `<!doctype html><html><head>
      <title>Fallback</title>
      <meta property="og:title" content="International News &amp; Analysis">
      <meta property="og:description" content="  Breaking news
         from around the world.  ">
      <meta property="og:image" content="/images/card.jpg">
      <meta property="og:site_name" content="The New York Times">
    </head><body><meta property="og:title" content="ignored, in body"></body></html>`;
    expect(parsePreview(html, 'https://www.nytimes.com/international/')).toEqual({
      url: 'https://www.nytimes.com/international/',
      title: 'International News & Analysis',
      description: 'Breaking news from around the world.',
      image: 'https://www.nytimes.com/images/card.jpg',
      siteName: 'The New York Times',
    });
  });

  it('falls back to Twitter tags, then <title> and the host', () => {
    const html = `<head><title> Kandy Lake </title><meta name="twitter:image" content="https://cdn.lk/k.png"><meta name="description" content="A walk"></head>`;
    expect(parsePreview(html, 'https://www.visit.lk/kandy')).toEqual({
      url: 'https://www.visit.lk/kandy',
      title: 'Kandy Lake',
      description: 'A walk',
      image: 'https://cdn.lk/k.png',
      siteName: 'visit.lk',
    });
  });

  it('drops insecure or broken images, trims long text, and needs a title', () => {
    const long = 'x'.repeat(500);
    const preview = parsePreview(
      `<meta property="og:title" content="${long}"><meta property="og:image" content="http://a.lk/i.jpg">`,
      'https://a.lk',
    )!;
    expect(preview.title).toHaveLength(200);
    expect(preview.title.endsWith('…')).toBe(true);
    expect(preview.image).toBeNull();
    expect(parsePreview('<p>no head</p>', 'https://a.lk')).toBeNull();
  });
});
