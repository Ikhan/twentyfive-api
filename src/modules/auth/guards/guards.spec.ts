import { Reflector } from '@nestjs/core';
import { testConfig } from '../../../../test/fakes/config.js';
import { httpContext } from '../../../../test/fakes/http-context.js';
import { Public } from '../../../common/decorators/public.decorator.js';
import { ForbiddenError, UnauthorizedError } from '../../../common/errors/app-error.js';
import { AccessTokenService } from '../tokens/access-token.service.js';
import { CsrfGuard } from './csrf.guard.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('JwtAuthGuard', () => {
  const tokens = new AccessTokenService(testConfig());
  const guard = new JwtAuthGuard(new Reflector(), tokens);

  it('lets @Public() routes through without a token', async () => {
    class Controller {
      @Public()
      open(): void {}
    }
    await expect(guard.canActivate(httpContext({}, Controller.prototype.open, Controller))).resolves.toBe(true);
  });

  it('requires a token everywhere else', async () => {
    await expect(guard.canActivate(httpContext({}))).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('accepts the access_token cookie and attaches the user', async () => {
    const ctx = httpContext({ cookies: { access_token: await tokens.sign('u1') } });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(ctx.switchToHttp().getRequest().user).toEqual({ id: 'u1' });
  });

  it('accepts a Bearer token, which wins over the cookie', async () => {
    const ctx = httpContext({
      headers: { authorization: `Bearer ${await tokens.sign('bearer-user')}` },
      cookies: { access_token: 'junk' },
    });
    await guard.canActivate(ctx);
    expect(ctx.switchToHttp().getRequest().user).toEqual({ id: 'bearer-user' });
  });

  it('rejects invalid tokens and malformed Authorization headers', async () => {
    await expect(guard.canActivate(httpContext({ cookies: { access_token: 'junk' } }))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    await expect(guard.canActivate(httpContext({ headers: { authorization: 'Basic abc' } }))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });
});

describe('CsrfGuard', () => {
  const guard = new CsrfGuard();
  const withSession = { access_token: 'a', csrf_token: 'csrf-123' };

  it('ignores safe methods', () => {
    expect(guard.canActivate(httpContext({ method: 'GET', cookies: withSession }))).toBe(true);
  });

  it('ignores requests without session cookies (Bearer clients, sign-in)', () => {
    expect(guard.canActivate(httpContext({ method: 'POST', cookies: {} }))).toBe(true);
  });

  it('requires the header to match the cookie on cookie-authenticated writes', () => {
    expect(
      guard.canActivate(httpContext({ method: 'POST', cookies: withSession, headers: { 'x-csrf-token': 'csrf-123' } })),
    ).toBe(true);
    expect(() => guard.canActivate(httpContext({ method: 'DELETE', cookies: withSession }))).toThrow(ForbiddenError);
    expect(() =>
      guard.canActivate(
        httpContext({ method: 'PATCH', cookies: withSession, headers: { 'x-csrf-token': 'csrf-999' } }),
      ),
    ).toThrow(ForbiddenError);
    expect(() =>
      guard.canActivate(httpContext({ method: 'POST', cookies: withSession, headers: { 'x-csrf-token': 'short' } })),
    ).toThrow(ForbiddenError);
  });

  it('protects refresh-only requests too, and fails when the csrf cookie is missing', () => {
    expect(() =>
      guard.canActivate(
        httpContext({ method: 'POST', cookies: { refresh_token: 'r' }, headers: { 'x-csrf-token': 'x' } }),
      ),
    ).toThrow(ForbiddenError);
  });
});
