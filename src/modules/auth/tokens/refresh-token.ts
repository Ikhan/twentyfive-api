import { createHash, randomBytes } from 'node:crypto';

/** Opaque 256-bit refresh token. Only its hash is stored, so a database leak can't be replayed. */
export function newRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
