import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { FollowStatus as DbFollowStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UserSummary } from '../users/users.types.js';
import type { FollowsRepository } from './follows.repository.js';
import type { FollowStatus, FollowTarget, SuggestionRow } from './follows.types.js';

const USER_SUMMARY = { id: true, username: true, displayName: true, avatarUrl: true, isPrivate: true } as const;
type Page = { afterUsername?: string; take: number };

/** How much each signal counts towards a suggestion (mutuals count once per person you follow). */
export const SUGGESTION_WEIGHT = { followsYou: 5, mutual: 3, sameHometown: 2, followedDistrict: 1, active: 1 } as const;
type RawSuggestion = Omit<SuggestionRow, 'hometown'> & { hometownId: string | null; hometownName: string | null };

@Injectable()
export class PrismaFollowsRepository implements FollowsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findTarget(username: string): Promise<FollowTarget | null> {
    return this.prisma.user.findUnique({ where: { username }, select: { id: true, username: true, isPrivate: true } });
  }

  async status(followerId: string, followeeId: string): Promise<FollowStatus | null> {
    const row = await this.prisma.follow.findUnique({
      where: { followerId_followeeId: { followerId, followeeId } },
      select: { status: true },
    });
    return row?.status ?? null;
  }

  async create(followerId: string, followeeId: string, status: FollowStatus): Promise<void> {
    await this.prisma.follow.createMany({
      data: [{ followerId, followeeId, status, acceptedAt: status === 'ACCEPTED' ? new Date() : null }],
      skipDuplicates: true,
    });
  }

  async remove(followerId: string, followeeId: string): Promise<void> {
    await this.prisma.follow.deleteMany({ where: { followerId, followeeId } });
  }

  async accept(followerId: string, followeeId: string): Promise<boolean> {
    const { count } = await this.prisma.follow.updateMany({
      where: { followerId, followeeId, status: DbFollowStatus.PENDING },
      data: { status: DbFollowStatus.ACCEPTED, acceptedAt: new Date() },
    });
    return count > 0;
  }

  async acceptAll(followeeId: string): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      const pending = await tx.follow.findMany({
        where: { followeeId, status: DbFollowStatus.PENDING },
        select: { followerId: true },
      });
      await tx.follow.updateMany({
        where: { followeeId, status: DbFollowStatus.PENDING },
        data: { status: DbFollowStatus.ACCEPTED, acceptedAt: new Date() },
      });
      return pending.map((p) => p.followerId);
    });
  }

  async counts(userId: string): Promise<{ followers: number; following: number; posts: number }> {
    const [followers, following, posts] = await Promise.all([
      this.prisma.follow.count({ where: { followeeId: userId, status: DbFollowStatus.ACCEPTED } }),
      this.prisma.follow.count({ where: { followerId: userId, status: DbFollowStatus.ACCEPTED } }),
      this.prisma.post.count({ where: { authorId: userId } }),
    ]);
    return { followers, following, posts };
  }

  followers(userId: string, page: Page): Promise<UserSummary[]> {
    return this.users({ following: { some: { followeeId: userId, status: DbFollowStatus.ACCEPTED } } }, page);
  }

  following(userId: string, page: Page): Promise<UserSummary[]> {
    return this.users({ followers: { some: { followerId: userId, status: DbFollowStatus.ACCEPTED } } }, page);
  }

  requests(userId: string, page: Page): Promise<UserSummary[]> {
    return this.users({ following: { some: { followeeId: userId, status: DbFollowStatus.PENDING } } }, page);
  }

  /**
   * One query. Mutuals only count for public candidates: a private account's followers are only visible
   * to its own followers, and you don't follow them yet.
   */
  async suggestions(viewerId: string, take: number): Promise<SuggestionRow[]> {
    const w = SUGGESTION_WEIGHT;
    const rows = await this.prisma.$queryRaw<RawSuggestion[]>`
      WITH mine AS (
        SELECT followee_id AS id FROM follows WHERE follower_id = ${viewerId}::uuid AND status = 'ACCEPTED'
      ), candidates AS (
        SELECT u.* FROM users u
        WHERE u.onboarded_at IS NOT NULL AND u.id <> ${viewerId}::uuid
          AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ${viewerId}::uuid AND f.followee_id = u.id)
          AND NOT EXISTS (
            SELECT 1 FROM blocks b
            WHERE (b.blocker_id = ${viewerId}::uuid AND b.blocked_id = u.id)
               OR (b.blocker_id = u.id AND b.blocked_id = ${viewerId}::uuid)
          )
      ), signals AS (
        SELECT c.id, c.username, c.display_name AS "displayName", c.avatar_url AS "avatarUrl",
          c.is_private AS "isPrivate", c.created_at, c.hometown_id AS "hometownId", d.name AS "hometownName",
          EXISTS (
            SELECT 1 FROM follows f
            WHERE f.follower_id = c.id AND f.followee_id = ${viewerId}::uuid AND f.status = 'ACCEPTED'
          ) AS "followsYou",
          CASE WHEN c.is_private THEN 0 ELSE (
            SELECT count(*)::int FROM follows f JOIN mine m ON m.id = f.follower_id
            WHERE f.followee_id = c.id AND f.status = 'ACCEPTED'
          ) END AS "mutualCount",
          CASE WHEN c.is_private THEN ARRAY[]::text[] ELSE ARRAY(
            SELECT u2.username FROM follows f JOIN mine m ON m.id = f.follower_id JOIN users u2 ON u2.id = f.follower_id
            WHERE f.followee_id = c.id AND f.status = 'ACCEPTED' ORDER BY u2.username LIMIT 2
          ) END AS "mutualUsernames",
          c.hometown_id IS NOT NULL
            AND c.hometown_id = (SELECT hometown_id FROM users WHERE id = ${viewerId}::uuid) AS "sameHometown",
          EXISTS (
            SELECT 1 FROM district_follows df WHERE df.user_id = ${viewerId}::uuid AND df.district_id = c.hometown_id
          ) AS "fromFollowedDistrict",
          EXISTS (
            SELECT 1 FROM posts p
            WHERE p.author_id = c.id AND p.audience = 'EVERYONE' AND p.created_at > now() - interval '7 days'
          ) AS active,
          (SELECT count(*)::int FROM follows f WHERE f.followee_id = c.id AND f.status = 'ACCEPTED') AS followers
        FROM candidates c LEFT JOIN districts d ON d.id = c.hometown_id
      )
      SELECT * FROM signals
      ORDER BY
        ${w.followsYou} * "followsYou"::int + ${w.mutual} * "mutualCount" + ${w.sameHometown} * "sameHometown"::int
          + ${w.followedDistrict} * "fromFollowedDistrict"::int + ${w.active} * active::int DESC,
        followers DESC, created_at DESC, id
      LIMIT ${take}`;
    return rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      isPrivate: r.isPrivate,
      followsYou: r.followsYou,
      mutualCount: r.mutualCount,
      mutualUsernames: r.mutualUsernames,
      hometown: r.hometownId && r.hometownName ? { id: r.hometownId, name: r.hometownName } : null,
      sameHometown: r.sameHometown,
      fromFollowedDistrict: r.fromFollowedDistrict,
    }));
  }

  private users(where: Prisma.UserWhereInput, { afterUsername, take }: Page): Promise<UserSummary[]> {
    return this.prisma.user.findMany({
      where: { ...where, ...(afterUsername && { username: { gt: afterUsername } }) },
      select: USER_SUMMARY,
      orderBy: { username: 'asc' },
      take,
    });
  }
}
