import type { Request, Response } from 'express';
import { testConfig } from '../../../test/fakes/config.js';
import { InvalidSessionError } from './auth.errors.js';
import { AuthController } from './auth.controller.js';
import type { AuthCookies } from './auth-cookies.js';
import type { AuthService } from './auth.service.js';
import type { AccessTokenService } from './tokens/access-token.service.js';

const user = { id: 'u1', username: 'kasun', displayName: 'Kasun', avatarUrl: null, hometownId: null, onboarded: false };
const session = { accessToken: 'at', refreshToken: 'rt', refreshExpiresAt: new Date(), user };

function setup(auth: Partial<AuthService>) {
  const cookies = { setSession: vi.fn(), clearSession: vi.fn(), setOAuthState: vi.fn(), clearOAuthState: vi.fn() };
  const controller = new AuthController(
    auth as AuthService,
    cookies as unknown as AuthCookies,
    { ttlSeconds: 900 } as AccessTokenService,
    testConfig(),
  );
  const res = { redirect: vi.fn() } as unknown as Response & { redirect: ReturnType<typeof vi.fn> };
  const req = {
    cookies: { oauth_state: 'sealed', refresh_token: 'rt' },
    headers: { 'user-agent': 'ua' },
  } as unknown as Request;
  return { controller, cookies, res, req };
}

describe('AuthController', () => {
  it('lists providers', () => {
    const { controller } = setup({ listProviders: () => [{ id: 'google', label: 'Google' }] });
    expect(controller.providers()).toEqual([{ id: 'google', label: 'Google' }]);
  });

  it('start stores the sealed state and redirects to the provider', async () => {
    const { controller, cookies, res } = setup({
      startSignIn: vi.fn().mockResolvedValue({ redirectUrl: 'https://p/auth', sealedState: 's' }),
    });
    await controller.start('google', res);
    expect(cookies.setOAuthState).toHaveBeenCalledWith(res, 's');
    expect(res.redirect).toHaveBeenCalledWith(302, 'https://p/auth');
  });

  it('callback sends new users to onboarding and returning users home', async () => {
    const newUser = setup({ completeSignIn: vi.fn().mockResolvedValue({ ...session, isNewUser: true }) });
    await newUser.controller.callback('google', 'code', 'state', newUser.req, newUser.res);
    expect(newUser.cookies.setSession).toHaveBeenCalledWith(
      newUser.res,
      expect.objectContaining({ accessToken: 'at' }),
      900,
    );
    expect(newUser.res.redirect).toHaveBeenCalledWith(302, 'https://twentyfive.test/onboarding');

    const returning = setup({
      completeSignIn: vi.fn().mockResolvedValue({ ...session, user: { ...user, onboarded: true }, isNewUser: false }),
    });
    await returning.controller.callback('google', 'code', 'state', returning.req, returning.res);
    expect(returning.res.redirect).toHaveBeenCalledWith(302, 'https://twentyfive.test/');
  });

  it('callback failures redirect to the sign-in page with an error, never a raw error page', async () => {
    const { controller, cookies, res, req } = setup({
      completeSignIn: vi.fn().mockRejectedValue(new Error('invalid_grant')),
    });
    await controller.callback('google', 'code', 'state', req, res);
    expect(cookies.clearOAuthState).toHaveBeenCalled();
    expect(cookies.setSession).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(302, 'https://twentyfive.test/signin?error=signin_failed');
  });

  it('refresh sets new cookies, and clears them when the session is invalid', async () => {
    const ok = setup({ refresh: vi.fn().mockResolvedValue(session) });
    await expect(ok.controller.refresh(ok.req, ok.res)).resolves.toEqual({ user });
    expect(ok.cookies.setSession).toHaveBeenCalled();

    const bad = setup({ refresh: vi.fn().mockRejectedValue(new InvalidSessionError()) });
    await expect(bad.controller.refresh(bad.req, bad.res)).rejects.toBeInstanceOf(InvalidSessionError);
    expect(bad.cookies.clearSession).toHaveBeenCalled();
  });

  it('logout revokes and clears cookies', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    const { controller, cookies, req, res } = setup({ logout });
    await expect(controller.logout(req, res)).resolves.toBeNull();
    expect(logout).toHaveBeenCalledWith('rt');
    expect(cookies.clearSession).toHaveBeenCalled();
  });

  it('session returns the current user', async () => {
    const { controller } = setup({ currentUser: vi.fn().mockResolvedValue(user) });
    await expect(controller.session({ id: 'u1' })).resolves.toEqual({ user });
  });
});
