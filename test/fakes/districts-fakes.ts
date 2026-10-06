import { Province } from '../../src/generated/prisma/enums.js';
import type { DistrictsRepository } from '../../src/modules/districts/districts.repository.js';
import type { DistrictActivity, DistrictRow, FollowState } from '../../src/modules/districts/districts.types.js';
import type { UserSummary } from '../../src/modules/users/users.types.js';

const row = (id: string, name: string, province: Province): DistrictRow => ({
  id,
  name,
  nameSi: `${name}-si`,
  nameTa: `${name}-ta`,
  province,
  tagline: `${name} tagline`,
  description: `${name} description`,
  famousFor: ['Something'],
  colorFrom: '#000000',
  colorTo: '#ffffff',
});

export class InMemoryDistrictsRepository implements DistrictsRepository {
  readonly rows = [
    row('ampara', 'Ampara', Province.EASTERN),
    row('kandy', 'Kandy', Province.CENTRAL),
    row('matale', 'Matale', Province.CENTRAL),
  ];
  readonly follows = new Set<string>(); // `${userId}:${districtId}`
  /** Follows with the bell on, same keys as `follows`. */
  readonly notifying = new Set<string>();
  readonly people: (UserSummary & { hometownId: string })[] = [];
  /** Public activity (already weighted), as the real repository would find it in the tables. */
  readonly events: { districtId: string; weight: number; at: Date; post: boolean }[] = [];

  async list(province?: Province): Promise<DistrictRow[]> {
    return this.rows.filter((r) => !province || r.province === province);
  }

  async findById(id: string): Promise<DistrictRow | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }

  async followerCount(districtId: string): Promise<number> {
    return [...this.follows].filter((f) => f.endsWith(`:${districtId}`)).length;
  }

  async followStates(viewerId?: string): Promise<Map<string, FollowState>> {
    const states = new Map<string, FollowState>();
    for (const follow of this.follows) {
      const [userId, districtId] = follow.split(':') as [string, string];
      const state = states.get(districtId) ?? { followerCount: 0, followedByMe: false, notifying: false };
      const mine = userId === viewerId;
      states.set(districtId, {
        followerCount: state.followerCount + 1,
        followedByMe: state.followedByMe || mine,
        notifying: state.notifying || (mine && this.notifying.has(follow)),
      });
    }
    return states;
  }

  async findFollow(userId: string, districtId: string): Promise<{ notify: boolean } | null> {
    const key = `${userId}:${districtId}`;
    return this.follows.has(key) ? { notify: this.notifying.has(key) } : null;
  }

  async follow(userId: string, districtId: string): Promise<void> {
    this.follows.add(`${userId}:${districtId}`);
  }

  async unfollow(userId: string, districtId: string): Promise<void> {
    this.follows.delete(`${userId}:${districtId}`);
    this.notifying.delete(`${userId}:${districtId}`);
  }

  async setNotify(userId: string, districtId: string, notify: boolean): Promise<boolean> {
    const key = `${userId}:${districtId}`;
    if (!this.follows.has(key)) return false;
    if (notify) this.notifying.add(key);
    else this.notifying.delete(key);
    return true;
  }

  async activity(since: Date, halfLifeHours: number): Promise<DistrictActivity[]> {
    const totals = new Map<string, DistrictActivity>();
    for (const e of this.events.filter((e) => e.at >= since)) {
      const ageHours = (Date.now() - e.at.getTime()) / 3_600_000;
      const t = totals.get(e.districtId) ?? { districtId: e.districtId, posts: 0, score: 0 };
      totals.set(e.districtId, {
        districtId: e.districtId,
        posts: t.posts + (e.post ? 1 : 0),
        score: t.score + e.weight * 0.5 ** (ageHours / halfLifeHours),
      });
    }
    return [...totals.values()];
  }

  async residents(
    districtId: string,
    { afterUsername, take }: { afterUsername?: string; take: number },
  ): Promise<UserSummary[]> {
    return this.people
      .filter((p) => p.hometownId === districtId && (!afterUsername || p.username > afterUsername))
      .sort((a, b) => a.username.localeCompare(b.username))
      .slice(0, take)
      .map(({ hometownId: _h, ...p }) => p);
  }
}
