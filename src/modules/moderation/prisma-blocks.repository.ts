import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UserSummary } from '../users/users.types.js';
import type { BlocksRepository } from './blocks.repository.js';
import type { BlockTarget } from './moderation.types.js';

const USER_SUMMARY = { id: true, username: true, displayName: true, avatarUrl: true, isPrivate: true } as const;

@Injectable()
export class PrismaBlocksRepository implements BlocksRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUser(username: string): Promise<BlockTarget | null> {
    return this.prisma.user.findUnique({ where: { username }, select: { id: true, username: true } });
  }

  async block(blockerId: string, blockedId: string): Promise<boolean> {
    const { count } = await this.prisma.block.createMany({ data: [{ blockerId, blockedId }], skipDuplicates: true });
    return count > 0;
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    await this.prisma.block.deleteMany({ where: { blockerId, blockedId } });
  }

  async isBlockedBetween(userA: string, userB: string): Promise<boolean> {
    const count = await this.prisma.block.count({
      where: {
        OR: [
          { blockerId: userA, blockedId: userB },
          { blockerId: userB, blockedId: userA },
        ],
      },
    });
    return count > 0;
  }

  async blocked(
    blockerId: string,
    { afterUsername, take }: { afterUsername?: string; take: number },
  ): Promise<UserSummary[]> {
    const rows = await this.prisma.block.findMany({
      where: { blockerId, ...(afterUsername && { blocked: { username: { gt: afterUsername } } }) },
      select: { blocked: { select: USER_SUMMARY } },
      orderBy: { blocked: { username: 'asc' } },
      take,
    });
    return rows.map((r): UserSummary => r.blocked);
  }
}
