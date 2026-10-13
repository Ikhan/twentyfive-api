import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AdminRepository } from './invites.repository.js';
import type { FlaggedUser } from './invites.types.js';

const USER_SUMMARY = { id: true, username: true, displayName: true, avatarUrl: true, isPrivate: true } as const;

@Injectable()
export class PrismaAdminRepository implements AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserId(username: string): Promise<string | null> {
    return (await this.prisma.user.findUnique({ where: { username }, select: { id: true } }))?.id ?? null;
  }

  async ban(userId: string, reason: string, now: Date): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { bannedAt: now } }),
      this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
      this.prisma.invite.updateMany({
        where: { inviterId: userId, usedAt: null, expiresAt: { gt: now } },
        data: { expiresAt: now },
      }),
      // Already-flagged invitees keep their first reason.
      this.prisma.user.updateMany({
        where: { invitedById: userId, flaggedAt: null, bannedAt: null },
        data: { flaggedAt: now, flagReason: reason },
      }),
    ]);
  }

  async unban(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { bannedAt: null } });
  }

  async clearFlag(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { flaggedAt: null, flagReason: null } });
  }

  async listFlagged(): Promise<FlaggedUser[]> {
    const rows = await this.prisma.user.findMany({
      where: { flaggedAt: { not: null }, bannedAt: null },
      orderBy: [{ flaggedAt: 'desc' }, { id: 'asc' }],
      take: 500,
      select: { ...USER_SUMMARY, flaggedAt: true, flagReason: true, invitedBy: { select: USER_SUMMARY } },
    });
    return rows.map(({ flaggedAt, flagReason, invitedBy, ...user }) => ({
      user,
      flaggedAt: flaggedAt!,
      reason: flagReason ?? '',
      invitedBy,
    }));
  }
}
