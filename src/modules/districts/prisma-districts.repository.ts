import { Injectable } from '@nestjs/common';
import type { Province } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UserSummary } from '../users/users.types.js';
import type { DistrictsRepository } from './districts.repository.js';
import type { DistrictRow, FollowState } from './districts.types.js';

const SELECT = {
  id: true,
  name: true,
  nameSi: true,
  nameTa: true,
  province: true,
  tagline: true,
  description: true,
  famousFor: true,
  colorFrom: true,
  colorTo: true,
} as const;

@Injectable()
export class PrismaDistrictsRepository implements DistrictsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(province?: Province): Promise<DistrictRow[]> {
    return this.prisma.district.findMany({
      where: province ? { province } : {},
      select: SELECT,
      orderBy: { name: 'asc' },
    });
  }

  findById(id: string): Promise<DistrictRow | null> {
    return this.prisma.district.findUnique({ where: { id }, select: SELECT });
  }

  followerCount(districtId: string): Promise<number> {
    return this.prisma.districtFollow.count({ where: { districtId } });
  }

  /** Two queries for all districts: counts grouped by district, and the viewer's own follows. */
  async followStates(viewerId?: string): Promise<Map<string, FollowState>> {
    const [counts, mine] = await Promise.all([
      this.prisma.districtFollow.groupBy({ by: ['districtId'], _count: { _all: true } }),
      viewerId
        ? this.prisma.districtFollow.findMany({ where: { userId: viewerId }, select: { districtId: true } })
        : [],
    ]);
    const followed = new Set(mine.map((f) => f.districtId));
    return new Map(
      counts.map((c) => [c.districtId, { followerCount: c._count._all, followedByMe: followed.has(c.districtId) }]),
    );
  }

  async isFollowing(userId: string, districtId: string): Promise<boolean> {
    return (await this.prisma.districtFollow.count({ where: { userId, districtId } })) > 0;
  }

  async follow(userId: string, districtId: string): Promise<void> {
    await this.prisma.districtFollow.createMany({ data: [{ userId, districtId }], skipDuplicates: true });
  }

  async unfollow(userId: string, districtId: string): Promise<void> {
    await this.prisma.districtFollow.deleteMany({ where: { userId, districtId } });
  }

  residents(
    districtId: string,
    { afterUsername, take }: { afterUsername?: string; take: number },
  ): Promise<UserSummary[]> {
    return this.prisma.user.findMany({
      where: {
        hometownId: districtId,
        onboardedAt: { not: null },
        ...(afterUsername && { username: { gt: afterUsername } }),
      },
      select: { id: true, username: true, displayName: true, avatarUrl: true, isPrivate: true },
      orderBy: { username: 'asc' },
      take,
    });
  }
}
