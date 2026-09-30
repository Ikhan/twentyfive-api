import { firstLink } from './links.js';

describe('firstLink', () => {
  it('finds the first http(s) link, without trailing punctuation', () => {
    expect(firstLink('Read this: https://www.nytimes.com/international/.')).toBe(
      'https://www.nytimes.com/international/',
    );
    expect(firstLink('two http://a.lk/x and https://b.lk')).toBe('http://a.lk/x');
    expect(firstLink('(see https://example.com/page)')).toBe('https://example.com/page');
    expect(firstLink('wiki https://en.wikipedia.org/wiki/Kandy_(city) ok')).toBe(
      'https://en.wikipedia.org/wiki/Kandy_(city)',
    );
  });

  it('ignores text without a link, and other schemes', () => {
    expect(firstLink('no links here, just www.example.com')).toBeNull();
    expect(firstLink('javascript:alert(1) ftp://x.lk')).toBeNull();
  });
});
