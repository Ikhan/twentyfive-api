import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service.js';
import { InvalidSessionError, UnknownProviderError } from './auth.errors.js';
import { OAUTH_PROVIDERS, type OAuthProfile, type OAuthProvider, type ProviderId } from './oauth/oauth-provider.js';
import { codeChallengeFor, randomToken } from './oauth/pkce.js';
import { ACCOUNTS_REPOSITORY, type AccountsRepository, type SessionUser } from './repositories/accounts.repository.js';
import { SESSIONS_REPOSITORY, type SessionsRepository } from './repositories/sessions.repository.js';
import { AccessTokenService } from './tokens/access-token.service.js';
import { OAuthStateService } from './tokens/oauth-state.service.js';
import { hashToken, newRefreshToken } from './tokens/refresh-token.js';
import { usernameCandidates } from './username.js';

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: SessionUser;
}

export interface SignInStart {
  redirectUrl: string;
  /** Sealed state + PKCE verifier, stored in a short-lived cookie until the callback. */
  sealedState: string;
}

/** Sign-in with OAuth providers and the refresh-token session lifecycle. */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(OAUTH_PROVIDERS) private readonly providers: OAuthProvider[],
    @Inject(ACCOUNTS_REPOSITORY) private readonly accounts: AccountsRepository,
    @Inject(SESSIONS_REPOSITORY) private readonly sessions: SessionsRepository,
    private readonly accessTokens: AccessTokenService,
    private readonly oauthState: OAuthStateService,
    private readonly config: AppConfigService,
  ) {}

  /** Providers that are configured, for the sign-in page. */
  listProviders(): { id: ProviderId; label: string }[] {
    return this.providers.map(({ id, label }) => ({ id, label }));
  }

  async startSignIn(providerId: string): Promise<SignInStart> {
    const provider = this.provider(providerId);
    const state = randomToken();
    const codeVerifier = randomToken(48);
    const redirectUrl = provider.authorizationUrl({
      state,
      codeChallenge: codeChallengeFor(codeVerifier),
      redirectUri: this.redirectUri(provider.id),
    });
    return { redirectUrl, sealedState: await this.oauthState.seal({ provider: provider.id, state, codeVerifier }) };
  }

  /** Verifies the callback, finds or creates the user, and starts a session. */
  async completeSignIn(
    providerId: string,
    input: { code?: string; state?: string; sealedState?: string; userAgent?: string },
  ): Promise<IssuedSession & { isNewUser: boolean }> {
    const provider = this.provider(providerId);
    const { codeVerifier } = await this.oauthState.open(input.sealedState, provider.id, input.state);
    if (!input.code) throw new InvalidSessionError();
    const profile = await provider.fetchProfile({
      code: input.code,
      codeVerifier,
      redirectUri: this.redirectUri(provider.id),
    });

    const existing = await this.accounts.findUserByAccount(provider.dbProvider, profile.providerAccountId);
    const user = existing ?? (await this.createUser(provider, profile));
    const session = await this.issueSession(user, randomUUID(), input.userAgent);
    return { ...session, isNewUser: !existing };
  }

  /**
   * Exchanges a refresh token for a new pair (rotation). Reusing an already-rotated
   * token means it was probably stolen, so the whole sign-in family is revoked.
   */
  async refresh(refreshToken: string | undefined, userAgent?: string): Promise<IssuedSession> {
    if (!refreshToken) throw new InvalidSessionError();
    const session = await this.sessions.findByTokenHash(hashToken(refreshToken));
    if (!session) throw new InvalidSessionError();
    if (session.revokedAt) {
      this.logger.warn(`Refresh token reuse detected; revoking session family ${session.familyId}`);
      await this.sessions.revokeFamily(session.familyId);
      throw new InvalidSessionError();
    }
    if (session.expiresAt <= new Date()) throw new InvalidSessionError();

    const user = await this.accounts.findUserById(session.userId);
    if (!user) throw new InvalidSessionError();
    const next = this.newRefresh();
    await this.sessions.rotate(session.id, {
      userId: user.id,
      familyId: session.familyId,
      tokenHash: next.hash,
      expiresAt: next.expiresAt,
      userAgent,
    });
    return {
      accessToken: await this.accessTokens.sign(user.id),
      refreshToken: next.token,
      refreshExpiresAt: next.expiresAt,
      user,
    };
  }

  /** Ends the session. Idempotent: unknown or missing tokens are ignored. */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const session = await this.sessions.findByTokenHash(hashToken(refreshToken));
    if (session) await this.sessions.revoke(session.id);
  }

  async currentUser(userId: string): Promise<SessionUser> {
    const user = await this.accounts.findUserById(userId);
    if (!user) throw new InvalidSessionError();
    return user;
  }

  private async issueSession(user: SessionUser, familyId: string, userAgent?: string): Promise<IssuedSession> {
    const refresh = this.newRefresh();
    await this.sessions.create({
      userId: user.id,
      familyId,
      tokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
      userAgent,
    });
    return {
      accessToken: await this.accessTokens.sign(user.id),
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
      user,
    };
  }

  private async createUser(provider: OAuthProvider, profile: OAuthProfile): Promise<SessionUser> {
    const username = await this.firstFreeUsername(profile.displayName);
    return this.accounts.createUserWithAccount({
      username,
      displayName: profile.displayName.slice(0, 50),
      email: profile.email,
      avatarUrl: profile.avatarUrl,
      provider: provider.dbProvider,
      providerAccountId: profile.providerAccountId,
    });
  }

  private async firstFreeUsername(displayName: string): Promise<string> {
    for (const candidate of usernameCandidates(displayName)) {
      if (!(await this.accounts.usernameExists(candidate))) return candidate;
    }
    // Astronomically unlikely after six random suffixes; fall back to a guaranteed-unique handle.
    return `user_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }

  private newRefresh(): { token: string; hash: string; expiresAt: Date } {
    const token = newRefreshToken();
    const days = this.config.get('REFRESH_TOKEN_TTL_DAYS');
    return { token, hash: hashToken(token), expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000) };
  }

  private provider(id: string): OAuthProvider {
    const provider = this.providers.find((p) => p.id === id);
    if (!provider) throw new UnknownProviderError(id);
    return provider;
  }

  private redirectUri(provider: ProviderId): string {
    return `${this.config.get('API_PUBLIC_URL')}/api/v1/auth/${provider}/callback`;
  }
}
