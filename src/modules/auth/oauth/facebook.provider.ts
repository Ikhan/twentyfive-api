import { OAuthProvider as ProviderEnum } from '../../../generated/prisma/enums.js';
import { requestJson, type HttpFetch } from './oauth-http.js';
import type { AuthorizationRequest, CodeExchange, OAuthProfile, OAuthProvider } from './oauth-provider.js';

const GRAPH = 'https://graph.facebook.com/v21.0';

interface FacebookMe {
  id: string;
  name?: string;
  email?: string;
  picture?: { data?: { url?: string; is_silhouette?: boolean } };
}

/** Facebook Login. https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow */
export class FacebookProvider implements OAuthProvider {
  readonly id = 'facebook' as const;
  readonly label = 'Facebook';
  readonly dbProvider = ProviderEnum.FACEBOOK;

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
      scope: 'public_profile,email',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return `https://www.facebook.com/v21.0/dialog/oauth?${params}`;
  }

  async fetchProfile({ code, codeVerifier, redirectUri }: CodeExchange): Promise<OAuthProfile> {
    const tokenParams = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: redirectUri,
      code,
      code_verifier: codeVerifier,
    });
    const token = await requestJson<{ access_token: string }>(
      this.http,
      this.label,
      `${GRAPH}/oauth/access_token?${tokenParams}`,
    );
    const meParams = new URLSearchParams({
      fields: 'id,name,email,picture.type(large)',
      access_token: token.access_token,
    });
    const me = await requestJson<FacebookMe>(this.http, this.label, `${GRAPH}/me?${meParams}`);
    const picture = me.picture?.data;
    return {
      providerAccountId: me.id,
      displayName: me.name?.trim() || 'Facebook user',
      email: me.email,
      avatarUrl: picture && !picture.is_silhouette ? picture.url : undefined,
    };
  }
}
