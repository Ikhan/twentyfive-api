import { Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import { UnauthorizedError } from '../../../common/errors/app-error.js';
import { AppConfigService } from '../../../config/app-config.service.js';
import type { ProviderId } from '../oauth/oauth-provider.js';

export interface OAuthState {
  provider: ProviderId;
  state: string;
  codeVerifier: string;
}

const PURPOSE = 'oauth-state';

/**
 * Carries the OAuth `state` and PKCE verifier between /start and /callback in a
 * signed, short-lived cookie, so the server needs no session storage for sign-in.
 */
@Injectable()
export class OAuthStateService {
  static readonly TTL_SECONDS = 10 * 60;
  private readonly key: Uint8Array;

  constructor(config: AppConfigService) {
    this.key = new TextEncoder().encode(`${PURPOSE}:${config.get('JWT_ACCESS_SECRET')}`);
  }

  seal(value: OAuthState): Promise<string> {
    return new SignJWT({ ...value, purpose: PURPOSE })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${OAuthStateService.TTL_SECONDS}s`)
      .sign(this.key);
  }

  /** Verifies the cookie and that it matches the provider and state echoed back by the provider. */
  async open(sealed: string | undefined, provider: ProviderId, returnedState: string | undefined): Promise<OAuthState> {
    const fail = () => new UnauthorizedError('Sign-in expired or was tampered with. Please try again.');
    if (!sealed || !returnedState) throw fail();
    try {
      const { payload } = await jwtVerify(sealed, this.key, { algorithms: ['HS256'] });
      const value = payload as unknown as OAuthState & { purpose: string };
      if (value.purpose !== PURPOSE || value.provider !== provider || value.state !== returnedState) throw fail();
      return { provider: value.provider, state: value.state, codeVerifier: value.codeVerifier };
    } catch {
      throw fail();
    }
  }
}
