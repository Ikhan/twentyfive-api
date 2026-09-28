import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedRequest } from '../../../common/auth-user.js';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator.js';
import { UnauthorizedError } from '../../../common/errors/app-error.js';
import { COOKIE } from '../auth-cookies.js';
import { AccessTokenService } from '../tokens/access-token.service.js';

/**
 * Global guard: every route needs a valid access token unless marked @Public()
 * (public routes still attach the user when a valid token is present).
 * Accepts the httpOnly cookie (web) or an Authorization: Bearer header (future mobile clients).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AccessTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<Request & AuthenticatedRequest>();
    const token = bearerToken(request) ?? (request.cookies?.[COOKIE.access] as string | undefined);

    if (isPublic) {
      // Optional sign-in: public routes still know who you are when you have a valid session
      // (e.g. "you follow this district"), but never fail because of a missing or stale token.
      if (token) {
        request.user = await this.tokens.verify(token).then(
          (id) => ({ id }),
          () => undefined,
        );
      }
      return true;
    }

    if (!token) throw new UnauthorizedError('Please sign in.');
    request.user = { id: await this.tokens.verify(token) };
    return true;
  }
}

function bearerToken(request: Request): string | undefined {
  const [scheme, value] = request.headers.authorization?.split(' ') ?? [];
  return scheme?.toLowerCase() === 'bearer' && value ? value : undefined;
}
