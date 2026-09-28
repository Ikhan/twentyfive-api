import { Injectable } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { AppConfigService } from '../../config/app-config.service.js';
import { randomToken } from './oauth/pkce.js';
import { OAuthStateService } from './tokens/oauth-state.service.js';

export const COOKIE = {
  access: 'access_token',
  refresh: 'refresh_token',
  /** Readable by the web app, which echoes it in the X-CSRF-Token header (double-submit). */
  csrf: 'csrf_token',
  oauthState: 'oauth_state',
} as const;

export const CSRF_HEADER = 'x-csrf-token';
const AUTH_PATH = '/api/v1/auth';

/** Sets and clears auth cookies with one consistent, secure configuration. */
@Injectable()
export class AuthCookies {
  constructor(private readonly config: AppConfigService) {}

  setSession(
    res: Response,
    session: { accessToken: string; refreshToken: string; refreshExpiresAt: Date },
    accessTtlSeconds: number,
  ): void {
    res.cookie(COOKIE.access, session.accessToken, this.options({ maxAge: accessTtlSeconds * 1000 }));
    res.cookie(
      COOKIE.refresh,
      session.refreshToken,
      this.options({ path: AUTH_PATH, expires: session.refreshExpiresAt }),
    );
    res.cookie(COOKIE.csrf, randomToken(24), this.options({ httpOnly: false, expires: session.refreshExpiresAt }));
  }

  clearSession(res: Response): void {
    res.clearCookie(COOKIE.access, this.options());
    res.clearCookie(COOKIE.refresh, this.options({ path: AUTH_PATH }));
    res.clearCookie(COOKIE.csrf, this.options({ httpOnly: false }));
  }

  setOAuthState(res: Response, sealed: string): void {
    res.cookie(
      COOKIE.oauthState,
      sealed,
      this.options({ path: AUTH_PATH, maxAge: OAuthStateService.TTL_SECONDS * 1000 }),
    );
  }

  clearOAuthState(res: Response): void {
    res.clearCookie(COOKIE.oauthState, this.options({ path: AUTH_PATH }));
  }

  private options(overrides: CookieOptions = {}): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.isProduction,
      // Lax: sent on same-site requests and top-level navigations (the OAuth callback), not on cross-site POSTs.
      sameSite: 'lax',
      path: '/',
      domain: this.config.get('COOKIE_DOMAIN'),
      ...overrides,
    };
  }
}
