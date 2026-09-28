import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedRequest } from '../../../common/auth-user.js';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator.js';
import { UnauthorizedError } from '../../../common/errors/app-error.js';
import { COOKIE } from '../auth-cookies.js';
import { AccessTokenService } from '../tokens/access-token.service.js';

/**
 * Global guard: every route needs a valid access token unless marked @Public().
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
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & AuthenticatedRequest>();
    const token = bearerToken(request) ?? (request.cookies?.[COOKIE.access] as string | undefined);
    if (!token) throw new UnauthorizedError('Please sign in.');
    request.user = { id: await this.tokens.verify(token) };
    return true;
  }
}

function bearerToken(request: Request): string | undefined {
  const [scheme, value] = request.headers.authorization?.split(' ') ?? [];
  return scheme?.toLowerCase() === 'bearer' && value ? value : undefined;
}
