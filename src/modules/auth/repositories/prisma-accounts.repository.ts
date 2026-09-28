import { Injectable } from '@nestjs/common';
import type { OAuthProvider } from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
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
    const user = await this.prisma.user.findUnique({ where: { id }, select: SELECT });
    return user ? toSessionUser(user) : null;
  }

  async usernameExists(username: string): Promise<boolean> {
    return (await this.prisma.user.count({ where: { username } })) > 0;
  }

  async createUserWithAccount(input: NewAccountUser): Promise<SessionUser> {
    const user = await this.prisma.user.create({
      data: {
        username: input.username,
        displayName: input.displayName,
        email: input.email,
        avatarUrl: input.avatarUrl,
        accounts: { create: { provider: input.provider, providerAccountId: input.providerAccountId } },
      },
      select: SELECT,
    });
    return toSessionUser(user);
  }
}
