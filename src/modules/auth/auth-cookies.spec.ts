import type { Response } from 'express';
import { testConfig } from '../../../test/fakes/config.js';
import { AuthCookies } from './auth-cookies.js';

function fakeResponse() {
  const cookie = vi.fn();
  const clearCookie = vi.fn();
  return { res: { cookie, clearCookie } as unknown as Response, cookie, clearCookie };
}

describe('AuthCookies', () => {
  const session = { accessToken: 'at', refreshToken: 'rt', refreshExpiresAt: new Date('2030-01-01') };

  it('sets httpOnly session cookies, a readable CSRF cookie, and scopes the refresh cookie to /auth', () => {
    const { res, cookie } = fakeResponse();
    new AuthCookies(testConfig()).setSession(res, session, 900);
    const byName = Object.fromEntries(cookie.mock.calls.map(([name, value, options]) => [name, { value, options }]));
    expect(byName.access_token).toMatchObject({
      value: 'at',
      options: { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 900_000, secure: false },
    });
    expect(byName.refresh_token).toMatchObject({
      value: 'rt',
      options: { httpOnly: true, path: '/api/v1/auth', expires: session.refreshExpiresAt },
    });
    expect(byName.csrf_token.options.httpOnly).toBe(false);
    expect(byName.csrf_token.value).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it('marks cookies Secure in production and applies the cookie domain', () => {
    const { res, cookie } = fakeResponse();
    new AuthCookies(testConfig({ NODE_ENV: 'production', COOKIE_DOMAIN: '.twentyfive.lk' })).setSession(
      res,
      session,
      900,
    );
    for (const [, , options] of cookie.mock.calls)
      expect(options).toMatchObject({ secure: true, domain: '.twentyfive.lk' });
  });

  it('clears every session cookie with matching paths', () => {
    const { res, clearCookie } = fakeResponse();
    new AuthCookies(testConfig()).clearSession(res);
    expect(clearCookie.mock.calls.map(([name, options]) => [name, options.path])).toEqual([
      ['access_token', '/'],
      ['refresh_token', '/api/v1/auth'],
      ['csrf_token', '/'],
    ]);
  });

  it('sets and clears the short-lived OAuth state cookie', () => {
    const { res, cookie, clearCookie } = fakeResponse();
    const cookies = new AuthCookies(testConfig());
    cookies.setOAuthState(res, 'sealed');
    cookies.clearOAuthState(res);
    expect(cookie).toHaveBeenCalledWith(
      'oauth_state',
      'sealed',
      expect.objectContaining({ httpOnly: true, path: '/api/v1/auth', maxAge: 600_000 }),
    );
    expect(clearCookie).toHaveBeenCalledWith('oauth_state', expect.objectContaining({ path: '/api/v1/auth' }));
  });
});
