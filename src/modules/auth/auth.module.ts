import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppConfigService } from '../../config/app-config.service.js';
import { AuthCookies } from './auth-cookies.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { CsrfGuard } from './guards/csrf.guard.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { OAUTH_PROVIDERS } from './oauth/oauth-provider.js';
import { createOAuthProviders } from './oauth/oauth-providers.factory.js';
import { ACCOUNTS_REPOSITORY } from './repositories/accounts.repository.js';
import { PrismaAccountsRepository } from './repositories/prisma-accounts.repository.js';
import { PrismaSessionsRepository } from './repositories/prisma-sessions.repository.js';
import { SESSIONS_REPOSITORY } from './repositories/sessions.repository.js';
import { AccessTokenService } from './tokens/access-token.service.js';
import { OAuthStateService } from './tokens/oauth-state.service.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthCookies,
    AccessTokenService,
    OAuthStateService,
    { provide: OAUTH_PROVIDERS, inject: [AppConfigService], useFactory: createOAuthProviders },
    { provide: ACCOUNTS_REPOSITORY, useClass: PrismaAccountsRepository },
    { provide: SESSIONS_REPOSITORY, useClass: PrismaSessionsRepository },
    // Order matters: authenticate first, then check CSRF.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
  exports: [AccessTokenService],
})
export class AuthModule {}
