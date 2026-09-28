import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Paginated } from '../../common/api-response.js';
import { DomainEvent, type FollowAcceptedEvent, type FollowCreatedEvent } from '../../common/events/domain-events.js';
import { decodeCursor, toPage } from '../../common/pagination/cursor.js';
import type { UserSummary } from '../users/users.types.js';
import { BLOCK_CHECKER, type BlockChecker } from '../moderation/block-checker.js';
import {
  BlockedFollowError,
  CannotFollowSelfError,
  NoFollowRequestError,
  PrivateConnectionsError,
  UserNotFoundError,
} from './follows.errors.js';
import { FOLLOWS_REPOSITORY, type FollowsRepository } from './follows.repository.js';
import type {
  FollowStats,
  FollowTarget,
  Relationship,
  SuggestedUser,
  SuggestionReason,
  SuggestionRow,
} from './follows.types.js';

type Cursor = { u: string };
const isCursor = (v: unknown): v is Cursor =>
  typeof v === 'object' && v !== null && typeof (v as { u?: unknown }).u === 'string';
type PageInput = { cursor?: string; limit: number };

@Injectable()
export class FollowsService {
  constructor(
    @Inject(FOLLOWS_REPOSITORY) private readonly follows: FollowsRepository,
    private readonly events: EventEmitter2,
    @Inject(BLOCK_CHECKER) private readonly blocks: BlockChecker,
  ) {}

  /** Follows a public account, or sends a request to a private one. Idempotent. */
  async follow(viewerId: string, username: string): Promise<FollowStats> {
    const target = await this.target(username);
    if (target.id === viewerId) throw new CannotFollowSelfError();
    if (await this.blocks.isBlockedBetween(viewerId, target.id)) throw new BlockedFollowError(target.username);
    if (!(await this.follows.status(viewerId, target.id))) {
      const status = target.isPrivate ? 'PENDING' : 'ACCEPTED';
      await this.follows.create(viewerId, target.id, status);
      this.events.emit(DomainEvent.FollowCreated, {
        followerId: viewerId,
        followeeId: target.id,
        status,
      } satisfies FollowCreatedEvent);
    }
    return this.statsFor(viewerId, target);
  }

  /** Unfollows, or cancels a pending request. Idempotent. */
  async unfollow(viewerId: string, username: string): Promise<FollowStats> {
    const target = await this.target(username);
    await this.follows.remove(viewerId, target.id);
    return this.statsFor(viewerId, target);
  }

  async stats(viewerId: string, username: string): Promise<FollowStats> {
    return this.statsFor(viewerId, await this.target(username));
  }

  async followers(viewerId: string, username: string, page: PageInput): Promise<Paginated<UserSummary>> {
    const target = await this.visibleConnections(viewerId, username);
    return this.page(page, (after, take) => this.follows.followers(target.id, { afterUsername: after, take }));
  }

  async following(viewerId: string, username: string, page: PageInput): Promise<Paginated<UserSummary>> {
    const target = await this.visibleConnections(viewerId, username);
    return this.page(page, (after, take) => this.follows.following(target.id, { afterUsername: after, take }));
  }

  /** Incoming follow requests (for private accounts). */
  async requests(viewerId: string, page: PageInput): Promise<Paginated<UserSummary>> {
    return this.page(page, (after, take) => this.follows.requests(viewerId, { afterUsername: after, take }));
  }

  async acceptRequest(viewerId: string, requesterUsername: string): Promise<void> {
    const requester = await this.target(requesterUsername);
    if (!(await this.follows.accept(requester.id, viewerId))) throw new NoFollowRequestError(requesterUsername);
    this.events.emit(DomainEvent.FollowAccepted, {
      followerId: requester.id,
      followeeId: viewerId,
    } satisfies FollowAcceptedEvent);
  }

  async declineRequest(viewerId: string, requesterUsername: string): Promise<void> {
    const requester = await this.target(requesterUsername);
    if ((await this.follows.status(requester.id, viewerId)) !== 'PENDING')
      throw new NoFollowRequestError(requesterUsername);
    await this.follows.remove(requester.id, viewerId);
  }

  /** "People to follow", each with the most convincing reason to (follows you > mutuals > hometown). */
  async suggestions(viewerId: string, limit: number): Promise<SuggestedUser[]> {
    const rows = await this.follows.suggestions(viewerId, limit);
    return rows.map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      isPrivate: row.isPrivate,
      reason: suggestionReason(row),
    }));
  }

  /** Called when someone blocks someone: neither follows the other any more. */
  async severBetween(userA: string, userB: string): Promise<void> {
    await Promise.all([this.follows.remove(userA, userB), this.follows.remove(userB, userA)]);
  }

  /** Called when an account goes public: everyone who asked is now a follower. */
  async approveAllRequests(userId: string): Promise<void> {
    const approved = await this.follows.acceptAll(userId);
    for (const followerId of approved) {
      this.events.emit(DomainEvent.FollowAccepted, { followerId, followeeId: userId } satisfies FollowAcceptedEvent);
    }
  }

  private async statsFor(viewerId: string, target: FollowTarget): Promise<FollowStats> {
    const [counts, outgoing, incoming] = await Promise.all([
      this.follows.counts(target.id),
      target.id === viewerId ? Promise.resolve(null) : this.follows.status(viewerId, target.id),
      target.id === viewerId ? Promise.resolve(null) : this.follows.status(target.id, viewerId),
    ]);
    const relationship: Relationship =
      target.id === viewerId
        ? 'self'
        : outgoing === 'ACCEPTED'
          ? 'following'
          : outgoing === 'PENDING'
            ? 'requested'
            : 'none';
    return { ...counts, relationship, followsYou: incoming === 'ACCEPTED' };
  }

  /** Private accounts' follower lists are only visible to themselves and approved followers. */
  private async visibleConnections(viewerId: string, username: string): Promise<FollowTarget> {
    const target = await this.target(username);
    if (target.isPrivate && target.id !== viewerId && (await this.follows.status(viewerId, target.id)) !== 'ACCEPTED') {
      throw new PrivateConnectionsError(target.username);
    }
    return target;
  }

  private async target(username: string): Promise<FollowTarget> {
    const target = await this.follows.findTarget(username.toLowerCase());
    if (!target) throw new UserNotFoundError(username);
    return target;
  }

  private async page(
    page: PageInput,
    fetch: (after: string | undefined, take: number) => Promise<UserSummary[]>,
  ): Promise<Paginated<UserSummary>> {
    const after = decodeCursor(page.cursor, isCursor);
    const rows = await fetch(after?.u, page.limit + 1);
    return toPage(
      rows,
      page.limit,
      (u) => u,
      (u): Cursor => ({ u: u.username }),
    );
  }
}

function suggestionReason(row: SuggestionRow): SuggestionReason {
  if (row.followsYou) return { kind: 'follows-you' };
  if (row.mutualCount > 0) return { kind: 'followed-by', usernames: row.mutualUsernames, count: row.mutualCount };
  if (row.hometown && row.sameHometown) return { kind: 'hometown', district: row.hometown };
  if (row.hometown && row.fromFollowedDistrict) return { kind: 'followed-district', district: row.hometown };
  return null;
}
