import { scriptedFetch } from '../../../../test/fakes/fetch.js';
import { FacebookProvider } from './facebook.provider.js';
import { GoogleProvider } from './google.provider.js';
import { OAuthError, requestJson } from './oauth-http.js';

const auth = { state: 'st', codeChallenge: 'ch', redirectUri: 'https://api.test/api/v1/auth/x/callback' };
const exchange = { code: 'the-code', codeVerifier: 'the-verifier', redirectUri: auth.redirectUri };
const params = (url: string) => Object.fromEntries(new URL(url).searchParams);

describe('GoogleProvider', () => {
  it('builds an OIDC authorization URL with PKCE', () => {
    const url = new GoogleProvider('gid', 'gsecret').authorizationUrl(auth);
    expect(url).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
    expect(params(url)).toMatchObject({
      client_id: 'gid',
      scope: 'openid email profile',
      state: 'st',
      code_challenge: 'ch',
      code_challenge_method: 'S256',
    });
  });

  it('exchanges the code and maps the profile (only verified emails)', async () => {
    const { http, calls } = scriptedFetch(
      { body: { access_token: 'at' } },
      {
        body: {
          sub: 'g-1',
          name: 'Kasun Perera',
          email: 'k@example.lk',
          email_verified: false,
          picture: 'https://img',
        },
      },
    );
    const profile = await new GoogleProvider('gid', 'gsecret', http).fetchProfile(exchange);
    expect(profile).toEqual({
      providerAccountId: 'g-1',
      displayName: 'Kasun Perera',
      email: undefined,
      avatarUrl: 'https://img',
    });
    expect(String(calls[0]?.init?.body)).toContain('code_verifier=the-verifier');
    expect(calls[1]?.init?.headers).toMatchObject({ Authorization: 'Bearer at' });
  });

  it('keeps verified emails and defaults a missing name', async () => {
    const { http } = scriptedFetch(
      { body: { access_token: 'at' } },
      { body: { sub: 'g-2', email: 'a@b.lk', email_verified: true } },
    );
    await expect(new GoogleProvider('gid', 'gs', http).fetchProfile(exchange)).resolves.toMatchObject({
      displayName: 'Google user',
      email: 'a@b.lk',
    });
  });
});

describe('FacebookProvider', () => {
  it('builds the dialog URL with PKCE', () => {
    const url = new FacebookProvider('fid', 'fs').authorizationUrl(auth);
    expect(url).toMatch(/^https:\/\/www\.facebook\.com\/v21\.0\/dialog\/oauth\?/);
    expect(params(url)).toMatchObject({
      client_id: 'fid',
      scope: 'public_profile,email',
      code_challenge_method: 'S256',
    });
  });

  it('maps the Graph profile and skips the default silhouette avatar', async () => {
    const { http, calls } = scriptedFetch(
      { body: { access_token: 'at' } },
      {
        body: {
          id: 'f-1',
          name: 'Tharushi',
          email: 't@x.lk',
          picture: { data: { url: 'https://sil', is_silhouette: true } },
        },
      },
    );
    const profile = await new FacebookProvider('fid', 'fs', http).fetchProfile(exchange);
    expect(profile).toEqual({
      providerAccountId: 'f-1',
      displayName: 'Tharushi',
      email: 't@x.lk',
      avatarUrl: undefined,
    });
    expect(params(calls[0]!.url)).toMatchObject({
      code: 'the-code',
      code_verifier: 'the-verifier',
      client_secret: 'fs',
    });
    expect(params(calls[1]!.url)).toMatchObject({ access_token: 'at', fields: 'id,name,email,picture.type(large)' });
  });

  it('uses real photos and defaults a missing name', async () => {
    const { http } = scriptedFetch(
      { body: { access_token: 'at' } },
      { body: { id: 'f-2', picture: { data: { url: 'https://me', is_silhouette: false } } } },
    );
    await expect(new FacebookProvider('fid', 'fs', http).fetchProfile(exchange)).resolves.toMatchObject({
      displayName: 'Facebook user',
      avatarUrl: 'https://me',
    });
  });
});

describe('requestJson', () => {
  it('turns provider errors and network failures into OAuthError', async () => {
    const { http } = scriptedFetch({ status: 400, body: { error: 'invalid_grant' } });
    await expect(requestJson(http, 'Google', 'https://x')).rejects.toBeInstanceOf(OAuthError);
    const offline = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(requestJson(offline, 'Google', 'https://x')).rejects.toThrow('Couldn’t reach Google');
  });
});
