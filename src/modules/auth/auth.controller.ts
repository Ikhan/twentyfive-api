import { Controller, Get, HttpCode, Logger, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../common/auth-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { AuthCookies, COOKIE } from './auth-cookies.js';
import { AuthService } from './auth.service.js';
import type { SessionUser } from './repositories/accounts.repository.js';
import { AccessTokenService } from './tokens/access-token.service.js';

/** Stricter limit for sign-in endpoints than the global default. */
const AUTH_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly cookies: AuthCookies,
    private readonly accessTokens: AccessTokenService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Get('providers')
  @ApiOperation({ summary: 'Sign-in providers that are configured' })
  providers(): { id: string; label: string }[] {
    return this.auth.listProviders();
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Get(':provider/start')
  @ApiOperation({ summary: 'Redirects the browser to the provider’s sign-in page' })
  async start(@Param('provider') provider: string, @Res() res: Response): Promise<void> {
    const { redirectUrl, sealedState } = await this.auth.startSignIn(provider);
    this.cookies.setOAuthState(res, sealedState);
    res.redirect(302, redirectUrl);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Get(':provider/callback')
  @ApiOperation({ summary: 'Provider redirects here; signs in and redirects to the web app' })
  async callback(
    @Param('provider') provider: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const webApp = this.config.get('WEB_APP_URL');
    this.cookies.clearOAuthState(res);
    try {
      const session = await this.auth.completeSignIn(provider, {
        code,
        state,
        sealedState: req.cookies?.[COOKIE.oauthState] as string | undefined,
        userAgent: req.headers['user-agent'],
      });
      this.cookies.setSession(res, session, this.accessTokens.ttlSeconds);
      res.redirect(302, `${webApp}${session.user.onboarded ? '/' : '/onboarding'}`);
    } catch (error) {
      this.logger.warn(`Sign-in with ${provider} failed: ${error instanceof Error ? error.message : String(error)}`);
      res.redirect(302, `${webApp}/signin?error=signin_failed`);
    }
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotates the refresh token and issues a new access token' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ user: SessionUser }> {
    try {
      const session = await this.auth.refresh(
        req.cookies?.[COOKIE.refresh] as string | undefined,
        req.headers['user-agent'],
      );
      this.cookies.setSession(res, session, this.accessTokens.ttlSeconds);
      return { user: session.user };
    } catch (error) {
      this.cookies.clearSession(res);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ends the session and clears cookies' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<null> {
    await this.auth.logout(req.cookies?.[COOKIE.refresh] as string | undefined);
    this.cookies.clearSession(res);
    return null;
  }

  @Get('session')
  @ApiOperation({ summary: 'The signed-in user' })
  async session(@CurrentUser() user: AuthUser): Promise<{ user: SessionUser }> {
    return { user: await this.auth.currentUser(user.id) };
  }
}
