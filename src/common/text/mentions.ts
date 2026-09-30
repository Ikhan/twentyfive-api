/**
 * "@handle" at the start or after a non-word character (so not inside emails), 3–20 username characters,
 * and not running on past 20.
 */
const MENTION = /(?:^|[^\w@])@([A-Za-z0-9_]{3,20})(?!\w)/g;

/** Usernames mentioned in `text`, lowercase, each once, in order. */
export function mentionedUsernames(text: string): string[] {
  return [...new Set([...text.matchAll(MENTION)].map((m) => m[1]!.toLowerCase()))];
}
