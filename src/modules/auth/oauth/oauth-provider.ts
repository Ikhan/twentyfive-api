import type { OAuthProvider as OAuthProviderEnum } from '../../../generated/prisma/enums.js';

export type ProviderId = 'google' | 'facebook' | 'x';

/** The normalised profile every provider returns after sign-in. */
export interface OAuthProfile {
  /** The provider's stable user id (never the email, which can change). */
  providerAccountId: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
}

export interface AuthorizationRequest {
  state: string;
  codeChallenge: string;
  redirectUri: string;
}

export interface CodeExchange {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

/**
 * One OAuth 2.0 sign-in provider (authorization code flow with PKCE).
 * Add a provider by implementing this and registering it in AuthModule; nothing else changes.
 */
export interface OAuthProvider {
  readonly id: ProviderId;
  readonly label: string;
  readonly dbProvider: OAuthProviderEnum;
  authorizationUrl(request: AuthorizationRequest): string;
  fetchProfile(exchange: CodeExchange): Promise<OAuthProfile>;
}

/** Injection token for the list of enabled providers. */
export const OAUTH_PROVIDERS = Symbol('OAUTH_PROVIDERS');
