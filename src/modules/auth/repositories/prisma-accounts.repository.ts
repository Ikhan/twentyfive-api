import { Injectable } from '@nestjs/common';
import type { OAuthProvider } from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { InviteUnavailableError } from '../auth.errors.js';
import type { AccountsRepository, NewAccountUser, SessionUser } from './accounts.repository.js';

const SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  hometownId: true,
  onboardedAt: true,
} as const;

function toSessionUser({
  onboardedAt,
  ...user
}: { onboardedAt: Date | null } & Omit<SessionUser, 'onboarded'>): SessionUser {
  return { ...user, onboarded: onboardedAt !== null };
}

@Injectable()
export class PrismaAccountsRepository implements AccountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserByAccount(provider: OAuthProvider, providerAccountId: string): Promise<SessionUser | null> {
    const account = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId } },
      select: { user: { select: SELECT } },
    });
    return account ? toSessionUser(account.user) : null;
  }

  async findUserById(id: string): Promise<SessionUser | null> {
    const user = await this.prisma.user.findFirst({ where: { id, bannedAt: null }, select: SELECT });
    return user ? toSessionUser(user) : null;
  }

  async usernameExists(username: string): Promise<boolean> {
    return (await this.prisma.user.count({ where: { username } })) > 0;
  }

  async isBanned(userId: string): Promise<boolean> {
    return (await this.prisma.user.count({ where: { id: userId, bannedAt: { not: null } } })) > 0;
  }

  async createUserWithAccount({ inviteCode, ...input }: NewAccountUser): Promise<SessionUser> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: input.username,
          displayName: input.displayName,
          email: input.email,
          avatarUrl: input.avatarUrl,
          accounts: { create: { provider: input.provider, providerAccountId: input.providerAccountId } },
        },
        select: SELECT,
      });
      if (inviteCode) {
        const now = new Date();
        // Claims the invite only if nobody has yet: of two people racing for one link, one gets it.
        const claimed = await tx.invite.updateMany({
          where: { code: inviteCode, usedAt: null, expiresAt: { gt: now }, inviter: { bannedAt: null } },
          data: { usedById: user.id, usedAt: now },
        });
        if (claimed.count === 0) throw new InviteUnavailableError(); // rolls the new user back
        const { inviterId } = await tx.invite.findUniqueOrThrow({
          where: { code: inviteCode },
          select: { inviterId: true },
        });
        await tx.user.update({ where: { id: user.id }, data: { invitedById: inviterId } });
      }
      return toSessionUser(user);
    });
  }
}
