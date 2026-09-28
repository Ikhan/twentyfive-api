import { OAuthProvider as ProviderEnum } from '../../../generated/prisma/enums.js';
import { formBody, requestJson, type HttpFetch } from './oauth-http.js';
import type { AuthorizationRequest, CodeExchange, OAuthProfile, OAuthProvider } from './oauth-provider.js';

interface GoogleUserInfo {
  sub: string;
  name?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
}

/** Google sign-in (OpenID Connect). https://developers.google.com/identity/protocols/oauth2/web-server */
export class GoogleProvider implements OAuthProvider {
  readonly id = 'google' as const;
  readonly label = 'Google';
  readonly dbProvider = ProviderEnum.GOOGLE;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly http: HttpFetch = fetch,
  ) {}

  authorizationUrl({ state, codeChallenge, redirectUri }: AuthorizationRequest): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async fetchProfile({ code, codeVerifier, redirectUri }: CodeExchange): Promise<OAuthProfile> {
    const token = await requestJson<{ access_token: string }>(
      this.http,
      this.label,
      'https://oauth2.googleapis.com/token',
      formBody({
        code,
        code_verifier: codeVerifier,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    );
    const info = await requestJson<GoogleUserInfo>(
      this.http,
      this.label,
      'https://openidconnect.googleapis.com/v1/userinfo',
      {
        headers: { Authorization: `Bearer ${token.access_token}` },
      },
    );
    return {
      providerAccountId: info.sub,
      displayName: info.name?.trim() || 'Google user',
      // Only trust verified emails.
      email: info.email_verified ? info.email : undefined,
      avatarUrl: info.picture,
    };
  }
}
