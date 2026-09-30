import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UsernameTakenError } from './users.errors.js';
import type { UsersRepository } from './users.repository.js';
import type { MyProfile, ProfileChanges, UserSummary } from './users.types.js';

/** Makes user input literal inside a LIKE pattern. */
const likeLiteral = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

const SELECT = {
  id: true,
  username: true,
  displayName: true,
  bio: true,
  avatarUrl: true,
  headerUrl: true,
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

  search(viewerId: string, prefix: string, take: number): Promise<UserSummary[]> {
    const starts = `${likeLiteral(prefix)}%`;
    const wordStarts = `% ${likeLiteral(prefix)}%`;
    return this.prisma.$queryRaw<UserSummary[]>`
      SELECT u.id, u.username, u.display_name AS "displayName", u.avatar_url AS "avatarUrl", u.is_private AS "isPrivate"
      FROM users u
      WHERE u.onboarded_at IS NOT NULL AND u.id <> ${viewerId}::uuid
        AND (u.username LIKE ${starts} OR u.display_name ILIKE ${starts} OR u.display_name ILIKE ${wordStarts})
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE (b.blocker_id = ${viewerId}::uuid AND b.blocked_id = u.id)
             OR (b.blocker_id = u.id AND b.blocked_id = ${viewerId}::uuid)
        )
      ORDER BY
        EXISTS (
          SELECT 1 FROM follows f WHERE f.follower_id = ${viewerId}::uuid AND f.followee_id = u.id AND f.status = 'ACCEPTED'
        ) DESC,
        u.username LIKE ${starts} DESC,
        (SELECT count(*) FROM follows f WHERE f.followee_id = u.id AND f.status = 'ACCEPTED') DESC,
        u.username
      LIMIT ${take}`;
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
