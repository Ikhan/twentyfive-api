import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UsernameTakenError } from './users.errors.js';
import type { UsersRepository } from './users.repository.js';
import type { MyProfile, ProfileChanges } from './users.types.js';

const SELECT = {
  id: true,
  username: true,
  displayName: true,
  bio: true,
  avatarUrl: true,
  isPrivate: true,
  onboardedAt: true,
  createdAt: true,
  hometown: { select: { id: true, name: true } },
} as const satisfies Prisma.UserSelect;

type Row = Prisma.UserGetPayload<{ select: typeof SELECT }>;

function toProfile({ onboardedAt, createdAt, ...row }: Row): MyProfile {
  return { ...row, onboarded: onboardedAt !== null, joinedAt: createdAt };
}

@Injectable()
export class PrismaUsersRepository implements UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<MyProfile | null> {
    const row = await this.prisma.user.findUnique({ where: { id }, select: SELECT });
    return row ? toProfile(row) : null;
  }

  async findByUsername(username: string): Promise<MyProfile | null> {
    const row = await this.prisma.user.findUnique({ where: { username }, select: SELECT });
    return row ? toProfile(row) : null;
  }

  async usernameTaken(username: string, exceptUserId?: string): Promise<boolean> {
    const count = await this.prisma.user.count({
      where: { username, ...(exceptUserId && { NOT: { id: exceptUserId } }) },
    });
    return count > 0;
  }

  async districtExists(districtId: string): Promise<boolean> {
    return (await this.prisma.district.count({ where: { id: districtId } })) > 0;
  }

  async update(
    userId: string,
    changes: ProfileChanges,
    options: { completeOnboarding?: boolean } = {},
  ): Promise<MyProfile> {
    try {
      const row = await this.prisma.user.update({
        where: { id: userId },
        data: { ...changes, ...(options.completeOnboarding && { onboardedAt: new Date() }) },
        select: SELECT,
      });
      return toProfile(row);
    } catch (error) {
      // Two people picked the same username at the same moment: the unique index wins.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && changes.username) {
        throw new UsernameTakenError(changes.username);
      }
      throw error;
    }
  }
}
