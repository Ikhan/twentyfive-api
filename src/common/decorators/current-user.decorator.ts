import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser, AuthenticatedRequest } from '../auth-user.js';
import { UnauthorizedError } from '../errors/app-error.js';

export function currentUserFrom(ctx: ExecutionContext): AuthUser {
  const user = ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
  if (!user) throw new UnauthorizedError('Please sign in.');
  return user;
}

/** Injects the signed-in user ({ id }). Only use on routes protected by the auth guard. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser =>
  currentUserFrom(ctx),
);
