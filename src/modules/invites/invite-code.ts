import { randomInt } from 'node:crypto';

/** No 0/O, 1/I/L or U: easy to read out and type from a message. */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const LENGTH = 10;

/** A new invite code, e.g. "K7M2QX9PRT" (about 49 bits: not guessable, especially with sign-in rate limits). */
export function newInviteCode(): string {
  return Array.from({ length: LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
}

/** The code as stored (upper case, spaces and dashes dropped), or null if it can't be one. */
export function normalizeInviteCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.replace(/[\s-]/g, '').toUpperCase();
  return new RegExp(`^[${ALPHABET}]{${LENGTH}}$`).test(code) ? code : null;
}
