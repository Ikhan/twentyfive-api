import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { ForbiddenError } from '../../../common/errors/app-error.js';
import { COOKIE, CSRF_HEADER } from '../auth-cookies.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit CSRF protection for cookie-authenticated requests that change data:
 * the X-CSRF-Token header must match the csrf_token cookie. A cross-site attacker can
 * make the browser send cookies but can't read them to set the header.
 * Requests without session cookies (e.g. Bearer-token clients) aren't vulnerable and pass.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;
    const cookies = (request.cookies ?? {}) as Record<string, string | undefined>;
    if (!cookies[COOKIE.access] && !cookies[COOKIE.refresh]) return true;

    const expected = cookies[COOKIE.csrf];
    const actual = request.headers[CSRF_HEADER];
    if (typeof actual !== 'string' || !expected || !safeEqual(actual, expected)) {
      throw new ForbiddenError('Missing or invalid CSRF token.');
    }
    return true;
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
