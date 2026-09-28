import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Paginated } from '../../common/api-response.js';
import { DomainEvent, type UserBlockedEvent } from '../../common/events/domain-events.js';
import { decodeCursor, toPage } from '../../common/pagination/cursor.js';
import { UserNotFoundError } from '../follows/follows.errors.js';
import type { UserSummary } from '../users/users.types.js';
import type { BlockChecker } from './block-checker.js';
import { BLOCKS_REPOSITORY, type BlocksRepository } from './blocks.repository.js';
import { CannotBlockSelfError } from './moderation.errors.js';
import type { BlockTarget } from './moderation.types.js';

type Cursor = { u: string };
const isCursor = (v: unknown): v is Cursor =>
  typeof v === 'object' && v !== null && typeof (v as { u?: unknown }).u === 'string';

@Injectable()
export class BlocksService implements BlockChecker {
  constructor(
    @Inject(BLOCKS_REPOSITORY) private readonly blocks: BlocksRepository,
    private readonly events: EventEmitter2,
  ) {}

  /** Idempotent. Announces new blocks so follows between the two can be removed. */
  async block(blockerId: string, username: string): Promise<{ blocked: true }> {
    const target = await this.target(username);
    if (target.id === blockerId) throw new CannotBlockSelfError();
    if (await this.blocks.block(blockerId, target.id)) {
      this.events.emit(DomainEvent.UserBlocked, { blockerId, blockedId: target.id } satisfies UserBlockedEvent);
    }
    return { blocked: true };
  }

  /** Idempotent. Doesn't restore follows. */
  async unblock(blockerId: string, username: string): Promise<{ blocked: false }> {
    const target = await this.target(username);
    await this.blocks.unblock(blockerId, target.id);
    return { blocked: false };
  }

  async blocked(blockerId: string, page: { cursor?: string; limit: number }): Promise<Paginated<UserSummary>> {
    const after = decodeCursor(page.cursor, isCursor);
    const rows = await this.blocks.blocked(blockerId, { afterUsername: after?.u, take: page.limit + 1 });
    return toPage(
      rows,
      page.limit,
      (u) => u,
      (u): Cursor => ({ u: u.username }),
    );
  }

  isBlockedBetween(userA: string, userB: string): Promise<boolean> {
    return this.blocks.isBlockedBetween(userA, userB);
  }

  private async target(username: string): Promise<BlockTarget> {
    const target = await this.blocks.findUser(username.toLowerCase());
    if (!target) throw new UserNotFoundError(username);
    return target;
  }
}
