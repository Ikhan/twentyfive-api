import type { Prisma } from '../generated/prisma/client.js';

/** Users with no block, in either direction, between them and `viewerId`. */
export function notBlockedWith(viewerId: string): Prisma.UserWhereInput {
  return { blocking: { none: { blockedId: viewerId } }, blockedBy: { none: { blockerId: viewerId } } };
}
