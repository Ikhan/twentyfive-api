import { codeChallengeFor, randomToken } from './pkce.js';

describe('PKCE helpers', () => {
  it('computes the S256 challenge from RFC 7636 Appendix B', () => {
    expect(codeChallengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('generates URL-safe, unique random tokens of the requested strength', () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(a);
    expect(randomToken(48)).toHaveLength(64);
  });
});
