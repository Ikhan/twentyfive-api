import { OAuthProvider as ProviderEnum } from '../../../generated/prisma/enums.js';
import { formBody, requestJson, type HttpFetch } from './oauth-http.js';
import type { AuthorizationRequest, CodeExchange, OAuthProfile, OAuthProvider } from './oauth-provider.js';

interface XMe {
  data: { id: string; name?: string; username?: string; profile_image_url?: string };
}

/** X (Twitter) OAuth 2.0 with PKCE, confidential client. X never shares email. https://docs.x.com/resources/fundamentals/authentication/oauth-2-0/authorization-code */
export class XProvider implements OAuthProvider {
  readonly id = 'x' as const;
  readonly label = 'X';
  readonly dbProvider = ProviderEnum.X;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly http: HttpFetch = fetch,
  ) {}

  authorizationUrl({ state, codeChallenge, redirectUri }: AuthorizationRequest): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: 'users.read tweet.read',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return `https://x.com/i/oauth2/authorize?${params}`;
  }

  async fetchProfile({ code, codeVerifier, redirectUri }: CodeExchange): Promise<OAuthProfile> {
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const tokenRequest = formBody({
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });
    const token = await requestJson<{ access_token: string }>(
      this.http,
      this.label,
      'https://api.x.com/2/oauth2/token',
      {
        ...tokenRequest,
        headers: { ...(tokenRequest.headers as Record<string, string>), Authorization: `Basic ${basic}` },
      },
    );
    const me = await requestJson<XMe>(
      this.http,
      this.label,
      'https://api.x.com/2/users/me?user.fields=profile_image_url',
      {
        headers: { Authorization: `Bearer ${token.access_token}` },
      },
    );
    return {
      providerAccountId: me.data.id,
      displayName: me.data.name?.trim() || me.data.username || 'X user',
      // X returns a 48px "_normal" image by default; ask for the larger original.
      avatarUrl: me.data.profile_image_url?.replace('_normal.', '.'),
    };
  }
}
