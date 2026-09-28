import { createHash, randomBytes } from 'node:crypto';

/** Random URL-safe string (43+ chars) for OAuth `state` and PKCE `code_verifier`. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** PKCE S256 challenge for a verifier (RFC 7636). */
export function codeChallengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
