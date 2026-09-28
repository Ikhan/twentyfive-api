import { Province } from '../../src/generated/prisma/enums.js';
import type { DistrictsRepository } from '../../src/modules/districts/districts.repository.js';
import type { DistrictRow } from '../../src/modules/districts/districts.types.js';
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
  readonly people: (UserSummary & { hometownId: string })[] = [];

  async list(province?: Province): Promise<DistrictRow[]> {
    return this.rows.filter((r) => !province || r.province === province);
  }

  async findById(id: string): Promise<DistrictRow | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }

  async followerCount(districtId: string): Promise<number> {
    return [...this.follows].filter((f) => f.endsWith(`:${districtId}`)).length;
  }

  async isFollowing(userId: string, districtId: string): Promise<boolean> {
    return this.follows.has(`${userId}:${districtId}`);
  }

  async follow(userId: string, districtId: string): Promise<void> {
    this.follows.add(`${userId}:${districtId}`);
  }

  async unfollow(userId: string, districtId: string): Promise<void> {
    this.follows.delete(`${userId}:${districtId}`);
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
