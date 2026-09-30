import { LinkPreviewsService } from './link-previews.service.js';
import type { PageFetcher } from './page-fetcher.js';

function setup(pages: Record<string, string>) {
  const fetched: string[] = [];
  const fetcher: PageFetcher = {
    fetchPage: async (url) => {
      fetched.push(url);
      return pages[url] ? { url, html: pages[url] } : null;
    },
  };
  return { fetched, service: new LinkPreviewsService(fetcher) };
}

describe('LinkPreviewsService', () => {
  afterEach(() => vi.useRealTimers());

  it('makes a card from the page, fetching it once for many requests', async () => {
    const { service, fetched } = setup({ 'https://news.lk/a': '<meta property="og:title" content="A story">' });
    const [first, second] = await Promise.all([
      service.preview('https://news.lk/a#x'),
      service.preview('https://news.lk/a'),
    ]);
    expect(first).toEqual({
      url: 'https://news.lk/a',
      title: 'A story',
      description: null,
      image: null,
      siteName: 'news.lk',
    });
    expect(second).toEqual(first);
    await service.preview('https://news.lk/a');
    expect(fetched).toEqual(['https://news.lk/a']);
  });

  it('never fetches links that aren’t allowed', async () => {
    const { service, fetched } = setup({});
    await expect(service.preview('http://127.0.0.1/admin')).resolves.toBeNull();
    await expect(service.preview('file:///etc/passwd')).resolves.toBeNull();
    expect(fetched).toEqual([]);
  });

  it('retries a page without a card after 10 minutes, and keeps found cards for hours', async () => {
    vi.useFakeTimers();
    const { service, fetched } = setup({ 'https://ok.lk/': '<title>OK</title>' });
    await service.preview('https://none.lk/');
    await service.preview('https://ok.lk/');
    vi.advanceTimersByTime(11 * 60_000);
    await service.preview('https://none.lk/');
    await service.preview('https://ok.lk/');
    expect(fetched).toEqual(['https://none.lk/', 'https://ok.lk/', 'https://none.lk/']);
  });

  it('treats a failing fetcher as no card', async () => {
    const service = new LinkPreviewsService({ fetchPage: () => Promise.reject(new Error('boom')) });
    await expect(service.preview('https://x.lk/')).resolves.toBeNull();
  });
});
