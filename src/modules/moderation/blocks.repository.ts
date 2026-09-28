import type { UserSummary } from '../users/users.types.js';
import type { BlockTarget } from './moderation.types.js';

export interface BlocksRepository {
  findUser(username: string): Promise<BlockTarget | null>;
  /** Adds the block; false when it already existed. */
  block(blockerId: string, blockedId: string): Promise<boolean>;
  unblock(blockerId: string, blockedId: string): Promise<void>;
  isBlockedBetween(userA: string, userB: string): Promise<boolean>;
  /** People `blockerId` blocked, by username, after `afterUsername`. */
  blocked(blockerId: string, page: { afterUsername?: string; take: number }): Promise<UserSummary[]>;
}

export const BLOCKS_REPOSITORY = Symbol('BLOCKS_REPOSITORY');
