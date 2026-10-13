import {
  FakeOAuthProvider,
  InMemoryAccountsRepository,
  InMemorySessionsRepository,
} from '../../../test/fakes/auth-fakes.js';
import { testConfig } from '../../../test/fakes/config.js';
import {
  AccountBannedError,
  InvalidSessionError,
  InviteRequiredError,
  InviteUnavailableError,
  UnknownProviderError,
} from './auth.errors.js';
import { AuthService } from './auth.service.js';
import { AccessTokenService } from './tokens/access-token.service.js';
import { OAuthStateService } from './tokens/oauth-state.service.js';
import { hashToken } from './tokens/refresh-token.js';

function setup({ inviteOnly = false } = {}) {
  const config = testConfig({ REFRESH_TOKEN_TTL_DAYS: '30', INVITE_ONLY: String(inviteOnly) });
  const provider = new FakeOAuthProvider();
  const accounts = new InMemoryAccountsRepository();
  const sessions = new InMemorySessionsRepository();
  const tokens = new AccessTokenService(config);
  const state = new OAuthStateService(config);
  const service = new AuthService([provider], accounts, sessions, tokens, state, config);

  /** Runs start → callback like a browser would. */
  async function signIn(code = 'good-code', invite?: string) {
    const { redirectUrl, sealedState } = await service.startSignIn('google', invite);
    const returnedState = new URL(redirectUrl).searchParams.get('state') ?? undefined;
    return service.completeSignIn('google', { code, state: returnedState, sealedState, userAgent: 'vitest' });
  }
  return { service, provider, accounts, sessions, tokens, signIn };
}

describe('AuthService (invite-only)', () => {
  const CODE = 'K7M2QX9PRT';

  it('turns away a new person without an invite, creating nothing', async () => {
    const { signIn, accounts } = setup({ inviteOnly: true });
    await expect(signIn()).rejects.toBeInstanceOf(InviteRequiredError);
    expect(accounts.users.size).toBe(0);
  });

  it('signs up a new person with an invite, using it up', async () => {
    const { signIn, accounts } = setup({ inviteOnly: true });
    accounts.openInvites.add(CODE);
    const first = await signIn('good-code', CODE.toLowerCase()); // codes are read case-insensitively
    expect(first.isNewUser).toBe(true);
    expect(accounts.usedInvites.get(CODE)).toBe(first.user.id);
  });

  it('turns away an invite that was already used or never existed', async () => {
    const { signIn, accounts } = setup({ inviteOnly: true });
    await expect(signIn('good-code', CODE)).rejects.toBeInstanceOf(InviteUnavailableError);
    expect(accounts.users.size).toBe(0);
  });

  it('treats a malformed code like no invite', async () => {
    const { signIn } = setup({ inviteOnly: true });
    await expect(signIn('good-code', '<script>')).rejects.toBeInstanceOf(InviteRequiredError);
  });

  it('lets existing accounts sign in without an invite', async () => {
    const { signIn, accounts, provider } = setup({ inviteOnly: true });
    const id = (
      await accounts.createUserWithAccount({
        username: 'kasun',
        displayName: 'Kasun',
        provider: provider.dbProvider,
        providerAccountId: provider.profile.providerAccountId,
      })
    ).id;
    await expect(signIn()).resolves.toMatchObject({ isNewUser: false, user: { id } });
  });

  it('ignores invites once sign-up is open to everyone', async () => {
    const { signIn, accounts } = setup({ inviteOnly: false });
    accounts.openInvites.add(CODE);
    await expect(signIn('good-code', CODE)).resolves.toMatchObject({ isNewUser: true });
    expect(accounts.openInvites.has(CODE)).toBe(true);
  });

  it('turns away banned accounts, and their sessions stop refreshing', async () => {
    const { signIn, accounts, service } = setup();
    const { user, refreshToken } = await signIn();
    accounts.banned.add(user.id);
    await expect(signIn()).rejects.toBeInstanceOf(AccountBannedError);
    await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(InvalidSessionError);
  });
});

describe('AuthService', () => {
  it('lists configured providers', () => {
    expect(setup().service.listProviders()).toEqual([{ id: 'google', label: 'Google' }]);
  });

  it('rejects unknown or unconfigured providers', async () => {
    await expect(setup().service.startSignIn('myspace')).rejects.toBeInstanceOf(UnknownProviderError);
  });

  it('starts sign-in with a PKCE challenge and the API callback URL', async () => {
    const { redirectUrl, sealedState } = await setup().service.startSignIn('google');
    const params = new URL(redirectUrl).searchParams;
    expect(params.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(params.get('redirect_uri')).toBe('https://api.twentyfive.test/api/v1/auth/google/callback');
    expect(sealedState.split('.')).toHaveLength(3);
  });

  it('creates a new user on first sign-in and signs in the same user afterwards', async () => {
    const { signIn, accounts, provider, tokens } = setup();
    const first = await signIn();
    expect(first.isNewUser).toBe(true);
    expect(first.user).toMatchObject({ username: 'kasunperera', displayName: 'Kasun Perera', onboarded: false });
    await expect(tokens.verify(first.accessToken)).resolves.toBe(first.user.id);
    expect(provider.lastExchange?.codeVerifier).toBeTruthy();

    const second = await signIn();
    expect(second.isNewUser).toBe(false);
    expect(second.user.id).toBe(first.user.id);
    expect(accounts.users.size).toBe(1);
  });

  it('picks a free username when the natural one is taken', async () => {
    const { signIn, accounts } = setup();
    accounts.takenUsernames.add('kasunperera');
    expect((await signIn()).user.username).toMatch(/^kasunperera\d{4}$/);
  });

  it('falls back to a unique handle when every candidate is taken', async () => {
    const { signIn, accounts } = setup();
    accounts.usernameExists = async () => true;
    expect((await signIn()).user.username).toMatch(/^user_[a-f0-9]{12}$/);
  });

  it('fails sign-in on a forged state, a missing code or a rejected code', async () => {
    const { service, signIn } = setup();
    const { sealedState } = await service.startSignIn('google');
    await expect(service.completeSignIn('google', { code: 'c', state: 'forged', sealedState })).rejects.toThrow();
    const start = await service.startSignIn('google');
    const state = new URL(start.redirectUrl).searchParams.get('state') ?? undefined;
    await expect(service.completeSignIn('google', { state, sealedState: start.sealedState })).rejects.toBeInstanceOf(
      InvalidSessionError,
    );
    await expect(signIn('bad-code')).rejects.toThrow('invalid_grant');
  });

  it('rotates refresh tokens: the new one works, the old one is revoked', async () => {
    const { signIn, service, sessions } = setup();
    const signedIn = await signIn();
    const refreshed = await service.refresh(signedIn.refreshToken, 'vitest');
    expect(refreshed.refreshToken).not.toBe(signedIn.refreshToken);
    expect(refreshed.user.id).toBe(signedIn.user.id);
    expect(sessions.active()).toHaveLength(1);
    expect((await sessions.findByTokenHash(hashToken(signedIn.refreshToken)))?.revokedAt).toBeInstanceOf(Date);
  });

  it('revokes the whole family when an old refresh token is reused', async () => {
    const { signIn, service, sessions } = setup();
    const signedIn = await signIn();
    const refreshed = await service.refresh(signedIn.refreshToken);
    await expect(service.refresh(signedIn.refreshToken)).rejects.toBeInstanceOf(InvalidSessionError);
    expect(sessions.active()).toHaveLength(0);
    await expect(service.refresh(refreshed.refreshToken)).rejects.toBeInstanceOf(InvalidSessionError);
  });

  it('rejects missing, unknown and expired refresh tokens, and deleted users', async () => {
    const { signIn, service, sessions, accounts } = setup();
    await expect(service.refresh(undefined)).rejects.toBeInstanceOf(InvalidSessionError);
    await expect(service.refresh('nope')).rejects.toBeInstanceOf(InvalidSessionError);

    const a = await signIn();
    sessions.sessions[0]!.expiresAt = new Date(Date.now() - 1000);
    await expect(service.refresh(a.refreshToken)).rejects.toBeInstanceOf(InvalidSessionError);

    const b = await signIn();
    accounts.users.clear();
    await expect(service.refresh(b.refreshToken)).rejects.toBeInstanceOf(InvalidSessionError);
    await expect(service.currentUser(b.user.id)).rejects.toBeInstanceOf(InvalidSessionError);
  });

  it('logs out idempotently', async () => {
    const { signIn, service, sessions } = setup();
    const signedIn = await signIn();
    await service.logout(signedIn.refreshToken);
    await service.logout(signedIn.refreshToken);
    await service.logout(undefined);
    await service.logout('unknown');
    expect(sessions.active()).toHaveLength(0);
    await expect(service.refresh(signedIn.refreshToken)).rejects.toBeInstanceOf(InvalidSessionError);
  });

  it('returns the current user', async () => {
    const { signIn, service } = setup();
    const signedIn = await signIn();
    await expect(service.currentUser(signedIn.user.id)).resolves.toEqual(signedIn.user);
  });
});
