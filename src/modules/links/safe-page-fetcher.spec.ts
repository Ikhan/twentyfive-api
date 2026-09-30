import { MockAgent } from 'undici';
import { allowedUrl, BlockedAddressError, safeLookup, SafePageFetcher } from './safe-page-fetcher.js';

const HTML = { 'content-type': 'text/html; charset=utf-8' };

describe('allowedUrl', () => {
  it('allows ordinary web pages', () => {
    expect(allowedUrl('https://www.nytimes.com/international/#top')?.href).toBe(
      'https://www.nytimes.com/international/',
    );
    expect(allowedUrl('http://example.com:80/a')?.href).toBe('http://example.com/a');
  });

  it('refuses other schemes, odd ports, credentials and private IPs', () => {
    for (const url of [
      'file:///etc/passwd',
      'ftp://example.com',
      'javascript:alert(1)',
      'https://example.com:8443/',
      'http://example.com:6379/',
      'https://user:pass@example.com/',
      'http://127.0.0.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.5/',
      'http://[::1]/',
      'http://[::ffff:127.0.0.1]/',
      'not a url',
    ])
      expect(allowedUrl(url), url).toBeNull();
  });
});

describe('safeLookup', () => {
  const lookup = (host: string, all: boolean) =>
    new Promise<unknown>((resolve, reject) =>
      safeLookup(host, { all } as never, (error: Error | null, address: unknown) =>
        error ? reject(error) : resolve(address),
      ),
    );

  it('refuses names that resolve to private addresses (at connect time)', async () => {
    await expect(lookup('localhost', false)).rejects.toBeInstanceOf(BlockedAddressError);
    await expect(lookup('localhost', true)).rejects.toBeInstanceOf(BlockedAddressError);
  });
});

describe('SafePageFetcher', () => {
  function setup() {
    const agent = new MockAgent();
    agent.disableNetConnect();
    return { site: agent.get('https://news.lk'), fetcher: new SafePageFetcher(agent) };
  }

  it('returns the HTML and where it ended up, following safe redirects', async () => {
    const { site, fetcher } = setup();
    site.intercept({ path: '/a' }).reply(301, '', { headers: { location: '/b' } });
    site.intercept({ path: '/b' }).reply(200, '<head><title>B</title></head>', { headers: HTML });
    await expect(fetcher.fetchPage('https://news.lk/a')).resolves.toEqual({
      url: 'https://news.lk/b',
      html: '<head><title>B</title></head>',
    });
  });

  it('won’t follow a redirect into a private network', async () => {
    const { site, fetcher } = setup();
    site
      .intercept({ path: '/sneaky' })
      .reply(302, '', { headers: { location: 'http://169.254.169.254/latest/meta-data/' } });
    await expect(fetcher.fetchPage('https://news.lk/sneaky')).resolves.toBeNull();
  });

  it('gives up after too many redirects, on errors, and on anything that isn’t HTML', async () => {
    const { site, fetcher } = setup();
    site
      .intercept({ path: '/loop' })
      .reply(302, '', { headers: { location: '/loop' } })
      .times(5);
    site.intercept({ path: '/gone' }).reply(404, 'nope', { headers: HTML });
    site.intercept({ path: '/file.zip' }).reply(200, 'PK', { headers: { 'content-type': 'application/zip' } });
    site.intercept({ path: '/down' }).replyWithError(new Error('ECONNRESET'));
    for (const path of ['/loop', '/gone', '/file.zip', '/down']) {
      await expect(fetcher.fetchPage(`https://news.lk${path}`), path).resolves.toBeNull();
    }
  });

  it('reads at most 512 KB', async () => {
    const { site, fetcher } = setup();
    site.intercept({ path: '/huge' }).reply(200, 'x'.repeat(2 * 1024 * 1024), { headers: HTML });
    const page = await fetcher.fetchPage('https://news.lk/huge');
    expect(page!.html.length).toBe(512 * 1024);
  });
});
