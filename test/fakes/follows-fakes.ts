import type { FollowsRepository } from '../../src/modules/follows/follows.repository.js';
import type { FollowStatus, FollowTarget } from '../../src/modules/follows/follows.types.js';
import type { UserSummary } from '../../src/modules/users/users.types.js';

type Page = { afterUsername?: string; take: number };

export class InMemoryFollowsRepository implements FollowsRepository {
  readonly users: FollowTarget[] = [
    { id: 'u-kasun', username: 'kasun', isPrivate: false },
    { id: 'u-tharushi', username: 'tharushi', isPrivate: false },
    { id: 'u-sachini', username: 'sachini', isPrivate: true },
    { id: 'u-dilan', username: 'dilan', isPrivate: false },
  ];
  readonly edges = new Map<string, FollowStatus>(); // `${follower}>${followee}`

  async findTarget(username: string): Promise<FollowTarget | null> {
    return this.users.find((u) => u.username === username) ?? null;
  }

  async status(followerId: string, followeeId: string): Promise<FollowStatus | null> {
    return this.edges.get(`${followerId}>${followeeId}`) ?? null;
  }

  async create(followerId: string, followeeId: string, status: FollowStatus): Promise<void> {
    const key = `${followerId}>${followeeId}`;
    if (!this.edges.has(key)) this.edges.set(key, status);
  }

  async remove(followerId: string, followeeId: string): Promise<void> {
    this.edges.delete(`${followerId}>${followeeId}`);
  }

  async accept(followerId: string, followeeId: string): Promise<boolean> {
    const key = `${followerId}>${followeeId}`;
    if (this.edges.get(key) !== 'PENDING') return false;
    this.edges.set(key, 'ACCEPTED');
    return true;
  }

  async acceptAll(followeeId: string): Promise<string[]> {
    const approved: string[] = [];
    for (const [key, status] of this.edges) {
      const [follower, followee] = key.split('>');
      if (followee === followeeId && status === 'PENDING') {
        this.edges.set(key, 'ACCEPTED');
        approved.push(follower!);
      }
    }
    return approved;
  }

  async counts(userId: string): Promise<{ followers: number; following: number }> {
    const accepted = [...this.edges].filter(([, s]) => s === 'ACCEPTED').map(([k]) => k.split('>'));
    return {
      followers: accepted.filter(([, to]) => to === userId).length,
      following: accepted.filter(([from]) => from === userId).length,
    };
  }

  followers(userId: string, page: Page): Promise<UserSummary[]> {
    return this.list((from, to, s) => to === userId && s === 'ACCEPTED' && from, page);
  }

  following(userId: string, page: Page): Promise<UserSummary[]> {
    return this.list((from, to, s) => from === userId && s === 'ACCEPTED' && to, page);
  }

  requests(userId: string, page: Page): Promise<UserSummary[]> {
    return this.list((from, to, s) => to === userId && s === 'PENDING' && from, page);
  }

  private async list(
    pick: (from: string, to: string, s: FollowStatus) => string | false,
    { afterUsername, take }: Page,
  ): Promise<UserSummary[]> {
    const ids = [...this.edges].map(([k, s]) => pick(k.split('>')[0]!, k.split('>')[1]!, s)).filter(Boolean);
    return this.users
      .filter((u) => ids.includes(u.id) && (!afterUsername || u.username > afterUsername))
      .sort((a, b) => a.username.localeCompare(b.username))
      .slice(0, take)
      .map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.username,
        avatarUrl: null,
        isPrivate: u.isPrivate,
      }));
  }
}
