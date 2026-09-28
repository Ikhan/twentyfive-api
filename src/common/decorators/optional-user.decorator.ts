import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser, AuthenticatedRequest } from '../auth-user.js';

export function optionalUserFrom(ctx: ExecutionContext): AuthUser | undefined {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
}

/** On @Public() routes: the signed-in user if there is one, otherwise undefined. */
export const OptionalUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser | undefined =>
  optionalUserFrom(ctx),
);
