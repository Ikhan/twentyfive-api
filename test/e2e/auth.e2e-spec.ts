import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { OAUTH_PROVIDERS } from '../../src/modules/auth/oauth/oauth-provider.js';
import { FakeOAuthProvider } from '../fakes/auth-fakes.js';
import { CookieJar } from '../helpers/cookie-jar.js';
import { createTestApp } from '../helpers/create-test-app.js';
import { createTestPrisma, resetDatabase } from '../helpers/test-db.js';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  const provider = new FakeOAuthProvider();
  const prisma = createTestPrisma();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({
      env: { WEB_APP_URL: 'http://web.test', API_PUBLIC_URL: 'http://api.test' },
      overrides: [{ token: OAUTH_PROVIDERS, value: [provider] }],
    });
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });
  beforeEach(() => resetDatabase(prisma));

  /** Does what the browser does: /start, follow to the provider, come back to /callback. */
  async function signIn(jar = new CookieJar(), code = 'good-code') {
    const start = await http().get('/api/v1/auth/google/start').expect(302);
    jar.update(start);
    const state = new URL(start.headers.location as string).searchParams.get('state')!;
    const callback = await http()
      .get(`/api/v1/auth/google/callback?code=${code}&state=${state}`)
      .set('Cookie', jar.header())
      .expect(302);
    jar.update(callback);
    return { jar, location: callback.headers.location as string, start };
  }

  it('lists the configured providers', async () => {
    const res = await http().get('/api/v1/auth/providers').expect(200);
    expect(res.body.data).toEqual([{ id: 'google', label: 'Google' }]);
  });

  it('404s for unknown providers', async () => {
    const res = await http().get('/api/v1/auth/myspace/start').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('start redirects to the provider with PKCE and sets the state cookie', async () => {
    const { start } = await signIn();
    const url = new URL(start.headers.location as string);
    expect(url.origin).toBe('https://fake-oauth.test');
    expect(url.searchParams.get('redirect_uri')).toBe('http://api.test/api/v1/auth/google/callback');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(String(start.headers['set-cookie'])).toMatch(/oauth_state=.*HttpOnly/);
  });

  it('signs up a new user, sends them to onboarding, and sets secure cookies', async () => {
    const { jar, location } = await signIn();
    expect(location).toBe('http://web.test/onboarding');
    expect(jar.get('access_token')).toBeTruthy();
    expect(jar.get('refresh_token')).toBeTruthy();
    expect(jar.get('csrf_token')).toBeTruthy();
    expect(jar.get('oauth_state')).toBeUndefined();

    const session = await http().get('/api/v1/auth/session').set('Cookie', jar.header()).expect(200);
    expect(session.body.data.user).toMatchObject({
      username: 'kasunperera',
      displayName: 'Kasun Perera',
      onboarded: false,
    });
    expect(await prisma.user.count()).toBe(1);
  });

  it('signs a returning user back in without creating a duplicate', async () => {
    await signIn();
    const again = await signIn();
    expect(again.location).toBe('http://web.test/onboarding'); // still not onboarded
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.oAuthAccount.count()).toBe(1);
  });

  it('sends onboarded users home', async () => {
    const { jar } = await signIn();
    await prisma.user.updateMany({ data: { onboardedAt: new Date() } });
    expect((await signIn(jar)).location).toBe('http://web.test/');
  });

  it('rejects a callback with a forged state or a failed code exchange', async () => {
    const jar = new CookieJar();
    jar.update(await http().get('/api/v1/auth/google/start'));
    const forged = await http()
      .get('/api/v1/auth/google/callback?code=c&state=forged')
      .set('Cookie', jar.header())
      .expect(302);
    expect(forged.headers.location).toBe('http://web.test/signin?error=signin_failed');
    expect(String(forged.headers['set-cookie'])).not.toContain('access_token=ey');

    const failed = await signIn(new CookieJar(), 'bad-code');
    expect(failed.location).toBe('http://web.test/signin?error=signin_failed');
    expect(await prisma.user.count()).toBe(0);
  });

  it('protects routes: 401 without a session, Bearer tokens work too', async () => {
    await http().get('/api/v1/auth/session').expect(401);
    const { jar } = await signIn();
    await http()
      .get('/api/v1/auth/session')
      .set('Authorization', `Bearer ${jar.get('access_token')}`)
      .expect(200);
  });

  it('requires the CSRF header for cookie-authenticated writes', async () => {
    const { jar } = await signIn();
    const res = await http().post('/api/v1/auth/refresh').set('Cookie', jar.header()).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('refresh rotates tokens; reusing an old token kills the whole session family', async () => {
    const { jar } = await signIn();
    const oldRefresh = jar.get('refresh_token')!;

    const refreshed = await http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', jar.header())
      .set('X-CSRF-Token', jar.get('csrf_token')!)
      .expect(200);
    jar.update(refreshed);
    expect(refreshed.body.data.user.username).toBe('kasunperera');
    expect(jar.get('refresh_token')).not.toBe(oldRefresh);

    // An attacker replays the stolen old token…
    const thief = new CookieJar();
    thief.set('refresh_token', oldRefresh);
    thief.set('csrf_token', 'x');
    await http().post('/api/v1/auth/refresh').set('Cookie', thief.header()).set('X-CSRF-Token', 'x').expect(401);

    // …which also logs out the real user's current session.
    await http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', jar.header())
      .set('X-CSRF-Token', jar.get('csrf_token')!)
      .expect(401);
  });

  it('logout revokes the session and clears cookies', async () => {
    const { jar } = await signIn();
    const refreshToken = jar.get('refresh_token')!;
    const res = await http()
      .post('/api/v1/auth/logout')
      .set('Cookie', jar.header())
      .set('X-CSRF-Token', jar.get('csrf_token')!)
      .expect(200);
    jar.update(res);
    expect(jar.get('access_token')).toBeUndefined();
    expect(jar.get('refresh_token')).toBeUndefined();

    const stale = new CookieJar();
    stale.set('refresh_token', refreshToken);
    stale.set('csrf_token', 'x');
    await http().post('/api/v1/auth/refresh').set('Cookie', stale.header()).set('X-CSRF-Token', 'x').expect(401);
  });
});
