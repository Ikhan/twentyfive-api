import type { UserSummary } from '../users/users.types.js';
import type { FollowStatus, FollowTarget, SuggestionRow } from './follows.types.js';

export interface FollowsRepository {
  findTarget(username: string): Promise<FollowTarget | null>;
  status(followerId: string, followeeId: string): Promise<FollowStatus | null>;
  /** Creates the follow if absent; never downgrades an existing one. */
  create(followerId: string, followeeId: string, status: FollowStatus): Promise<void>;
  remove(followerId: string, followeeId: string): Promise<void>;
  /** PENDING → ACCEPTED. Returns false if there was no pending request. */
  accept(followerId: string, followeeId: string): Promise<boolean>;
  /** Approves every pending request to this user; returns the approved followers' ids. */
  acceptAll(followeeId: string): Promise<string[]>;
  counts(userId: string): Promise<{ followers: number; following: number }>;
  /** Accepted followers / following / pending requesters, by username, after `afterUsername`. */
  followers(userId: string, page: { afterUsername?: string; take: number }): Promise<UserSummary[]>;
  following(userId: string, page: { afterUsername?: string; take: number }): Promise<UserSummary[]>;
  requests(userId: string, page: { afterUsername?: string; take: number }): Promise<UserSummary[]>;
  /**
   * People `viewerId` might follow, best first: onboarded, not you, not already followed or requested,
   * and no block either way. Scored on the signals in SuggestionRow; ties go to more followers, then newer.
   */
  suggestions(viewerId: string, take: number): Promise<SuggestionRow[]>;
}

export const FOLLOWS_REPOSITORY = Symbol('FOLLOWS_REPOSITORY');
