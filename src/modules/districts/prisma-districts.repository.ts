import { Injectable } from '@nestjs/common';
import type { Province } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UserSummary } from '../users/users.types.js';
import type { DistrictsRepository } from './districts.repository.js';
import type { DistrictActivity, DistrictRow, FollowState } from './districts.types.js';

/** How much each kind of activity counts toward trending. */
const WEIGHT = { post: 3, comment: 2, repost: 2, quote: 2, like: 1, follow: 2 } as const;

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

  /**
   * One query: every activity since `since` becomes a weighted event, halved every `halfLifeHours`, summed
   * per district. Only public posts count (audience EVERYONE by a public account), and only posts with a
   * district. Quotes count toward the quoted post's district.
   */
  activity(since: Date, halfLifeHours: number): Promise<DistrictActivity[]> {
    return this.prisma.$queryRaw<DistrictActivity[]>`
      WITH public_posts AS (
        SELECT p.id, p.district_id, p.created_at
        FROM posts p JOIN users u ON u.id = p.author_id
        WHERE p.district_id IS NOT NULL AND p.audience = 'EVERYONE' AND NOT u.is_private
      ), events AS (
        SELECT district_id, ${WEIGHT.post}::int AS weight, created_at, 1 AS is_post
          FROM public_posts WHERE created_at >= ${since}
        UNION ALL SELECT pp.district_id, ${WEIGHT.comment}, c.created_at, 0
          FROM comments c JOIN public_posts pp ON pp.id = c.post_id WHERE c.created_at >= ${since}
        UNION ALL SELECT pp.district_id, ${WEIGHT.like}, l.created_at, 0
          FROM post_likes l JOIN public_posts pp ON pp.id = l.post_id WHERE l.created_at >= ${since}
        UNION ALL SELECT pp.district_id, ${WEIGHT.repost}, r.created_at, 0
          FROM reposts r JOIN public_posts pp ON pp.id = r.post_id WHERE r.created_at >= ${since}
        UNION ALL SELECT pp.district_id, ${WEIGHT.quote}, q.created_at, 0
          FROM posts q JOIN public_posts pp ON pp.id = q.quoted_post_id WHERE q.created_at >= ${since}
        UNION ALL SELECT district_id, ${WEIGHT.follow}, created_at, 0
          FROM district_follows WHERE created_at >= ${since}
      )
      SELECT district_id AS "districtId",
             SUM(is_post)::int AS posts,
             SUM(weight * power(0.5, EXTRACT(EPOCH FROM now() - created_at) / 3600 / ${halfLifeHours}))::float8 AS score
      FROM events
      GROUP BY district_id`;
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
