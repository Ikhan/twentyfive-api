import type { BlockChecker } from '../../src/modules/moderation/block-checker.js';
import type { BlocksRepository } from '../../src/modules/moderation/blocks.repository.js';
import type { BlockTarget, NewReport } from '../../src/modules/moderation/moderation.types.js';
import type { ReportsRepository } from '../../src/modules/moderation/reports.repository.js';
import type { UserSummary } from '../../src/modules/users/users.types.js';

/** Blocks as `${blocker}>${blocked}` pairs. */
export class FakeBlockChecker implements BlockChecker {
  readonly pairs = new Set<string>();

  async isBlockedBetween(userA: string, userB: string): Promise<boolean> {
    return this.pairs.has(`${userA}>${userB}`) || this.pairs.has(`${userB}>${userA}`);
  }
}

export class InMemoryBlocksRepository extends FakeBlockChecker implements BlocksRepository {
  readonly users: BlockTarget[] = [
    { id: 'u-kasun', username: 'kasun' },
    { id: 'u-arun', username: 'arun' },
    { id: 'u-dilan', username: 'dilan' },
  ];

  async findUser(username: string): Promise<BlockTarget | null> {
    return this.users.find((u) => u.username === username) ?? null;
  }

  async block(blockerId: string, blockedId: string): Promise<boolean> {
    const key = `${blockerId}>${blockedId}`;
    if (this.pairs.has(key)) return false;
    this.pairs.add(key);
    return true;
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    this.pairs.delete(`${blockerId}>${blockedId}`);
  }

  async blocked(blockerId: string, { afterUsername, take }: { afterUsername?: string; take: number }) {
    return this.users
      .filter((u) => this.pairs.has(`${blockerId}>${u.id}`) && (!afterUsername || u.username > afterUsername))
      .toSorted((a, b) => a.username.localeCompare(b.username))
      .slice(0, take)
      .map((u): UserSummary => ({
        id: u.id,
        username: u.username,
        displayName: u.username,
        avatarUrl: null,
        isPrivate: false,
      }));
  }
}

export class InMemoryReportsRepository implements ReportsRepository {
  readonly reports: NewReport[] = [];
  readonly comments = new Map<string, string>(); // commentId → postId
  readonly userIds = new Set(['u-kasun', 'u-sachini', 'u-arun']);

  async create(report: NewReport): Promise<void> {
    const same = (r: NewReport) =>
      r.reporterId === report.reporterId && r.targetType === report.targetType && r.targetId === report.targetId;
    if (!this.reports.some(same)) this.reports.push(report);
  }

  async commentPostId(commentId: string): Promise<string | null> {
    return this.comments.get(commentId) ?? null;
  }

  async userExists(userId: string): Promise<boolean> {
    return this.userIds.has(userId);
  }
}
