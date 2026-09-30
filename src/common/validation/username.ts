/** 3–20 characters: lowercase letters, numbers and underscore. Shared by sign-up and profile edits. */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

/** Handles that would clash with app routes or impersonate the service. */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'admin',
  'administrator',
  'api',
  'app',
  'auth',
  'explore',
  'help',
  'home',
  'login',
  'logout',
  'me',
  'moderator',
  'notifications',
  'onboarding',
  'post',
  'posts',
  'root',
  'search',
  'settings',
  'signin',
  'signup',
  'support',
  'system',
  'twentyfive',
  'twentyfivelk',
  'user',
  'users',
  'www',
]);

export type UsernameProblem = 'invalid' | 'reserved';

/** Why a username can't be used (format or reserved), or null if it's acceptable. Uniqueness is checked separately. */
export function usernameProblem(username: string): UsernameProblem | null {
  if (!USERNAME_PATTERN.test(username)) return 'invalid';
  if (RESERVED_USERNAMES.has(username)) return 'reserved';
  return null;
}
