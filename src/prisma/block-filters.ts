import type { Prisma } from '../generated/prisma/client.js';

/** Users with no block, in either direction, between them and `viewerId`, who aren't banned. */
export function notBlockedWith(viewerId: string): Prisma.UserWhereInput {
  return { ...NOT_BANNED, blocking: { none: { blockedId: viewerId } }, blockedBy: { none: { blockerId: viewerId } } };
}

/** Banned accounts disappear: profile, posts, comments, and from lists of people. */
export const NOT_BANNED = { bannedAt: null } as const satisfies Prisma.UserWhereInput;
