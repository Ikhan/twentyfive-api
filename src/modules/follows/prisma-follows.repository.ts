import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { FollowStatus as DbFollowStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UserSummary } from '../users/users.types.js';
import type { FollowsRepository } from './follows.repository.js';
import type { FollowStatus, FollowTarget } from './follows.types.js';

const USER_SUMMARY = { id: true, username: true, displayName: true, avatarUrl: true, isPrivate: true } as const;
type Page = { afterUsername?: string; take: number };

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

  async counts(userId: string): Promise<{ followers: number; following: number }> {
    const [followers, following] = await Promise.all([
      this.prisma.follow.count({ where: { followeeId: userId, status: DbFollowStatus.ACCEPTED } }),
      this.prisma.follow.count({ where: { followerId: userId, status: DbFollowStatus.ACCEPTED } }),
    ]);
    return { followers, following };
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

  private users(where: Prisma.UserWhereInput, { afterUsername, take }: Page): Promise<UserSummary[]> {
    return this.prisma.user.findMany({
      where: { ...where, ...(afterUsername && { username: { gt: afterUsername } }) },
      select: USER_SUMMARY,
      orderBy: { username: 'asc' },
      take,
    });
  }
}
