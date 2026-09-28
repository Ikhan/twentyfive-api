import { randomInt } from 'node:crypto';

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
const MAX_BASE = 15; // leaves room for a 4-digit suffix within 20 chars

/**
 * Candidate usernames for a new account, best first: "kasunperera", then "kasunperera4821"…
 * Names with no Latin letters (e.g. Sinhala or Tamil) fall back to "user####".
 * Users pick their own handle during onboarding; this only has to be unique and valid.
 */
export function usernameCandidates(displayName: string, count = 6): string[] {
  const ascii = displayName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, MAX_BASE);
  const base = ascii.length >= 3 ? ascii : 'user';
  const suffix = () => String(randomInt(1000, 10000));
  const candidates = base === 'user' ? [] : [base];
  while (candidates.length < count) candidates.push(`${base}${suffix()}`);
  return candidates;
}
