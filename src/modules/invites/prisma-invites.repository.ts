import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { UserRole } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { InvitesRepository, NewInvite } from './invites.repository.js';
import type { InvitePreview, InviteStatus, InviteView, NewWaitlistEntry, WaitlistView } from './invites.types.js';

const USER_SUMMARY = { id: true, username: true, displayName: true, avatarUrl: true, isPrivate: true } as const;

const INVITE = {
  code: true,
  createdAt: true,
  expiresAt: true,
  usedAt: true,
  usedBy: { select: USER_SUMMARY },
} as const satisfies Prisma.InviteSelect;

type InviteRow = Prisma.InviteGetPayload<{ select: typeof INVITE }>;

export function inviteStatus(invite: { usedAt: Date | null; expiresAt: Date }, now: Date): InviteStatus {
  if (invite.usedAt) return 'used';
  return invite.expiresAt <= now ? 'expired' : 'pending';
}

const toView = (row: InviteRow, now: Date): InviteView => ({ ...row, status: inviteStatus(row, now) });

/** Invites held against the limit: used, or still usable. */
const held = (inviterId: string, now: Date): Prisma.InviteWhereInput => ({
  inviterId,
  OR: [{ usedAt: { not: null } }, { expiresAt: { gt: now } }],
});

@Injectable()
export class PrismaInvitesRepository implements InvitesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async isAdmin(userId: string): Promise<boolean> {
    return (await this.prisma.user.count({ where: { id: userId, role: UserRole.ADMIN, bannedAt: null } })) > 0;
  }

  async listByInviter(inviterId: string, now: Date): Promise<InviteView[]> {
    const rows = await this.prisma.invite.findMany({
      where: { inviterId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      // Plenty for anyone but an admin, who only needs their recent ones here.
      take: 200,
      select: INVITE,
    });
    return rows.map((r) => toView(r, now));
  }

  countHeld(inviterId: string, now: Date): Promise<number> {
    return this.prisma.invite.count({ where: held(inviterId, now) });
  }

  async createWithin(invite: NewInvite, limit: number | null, now: Date): Promise<InviteView | null> {
    return this.prisma.$transaction(async (tx) => {
      // Holds the inviter's row until commit, so their requests take turns counting.
      await tx.$executeRaw`SELECT 1 FROM users WHERE id = ${invite.inviterId}::uuid FOR UPDATE`;
      if (limit !== null && (await tx.invite.count({ where: held(invite.inviterId, now) })) >= limit) return null;
      return toView(await tx.invite.create({ data: invite, select: INVITE }), now);
    });
  }

  async findOpen(code: string, now: Date): Promise<InvitePreview | null> {
    const row = await this.prisma.invite.findFirst({
      where: { code, usedAt: null, expiresAt: { gt: now }, inviter: { bannedAt: null } },
      select: { expiresAt: true, inviter: { select: USER_SUMMARY } },
    });
    return row;
  }

  async addToWaitlist(entry: NewWaitlistEntry): Promise<void> {
    await this.prisma.waitlistEntry.upsert({
      where: { email: entry.email },
      create: entry,
      update: {},
    });
  }

  async districtExists(districtId: string): Promise<boolean> {
    return (await this.prisma.district.count({ where: { id: districtId } })) > 0;
  }

  async listWaitlist(now: Date): Promise<WaitlistView[]> {
    const rows = await this.prisma.waitlistEntry.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 500,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        district: { select: { id: true, name: true } },
        invite: { select: { code: true, usedAt: true, expiresAt: true } },
      },
    });
    const views = rows.map(({ invite, ...row }) => ({
      ...row,
      invite: invite && { code: invite.code, status: inviteStatus(invite, now) },
    }));
    // Waiting first (never invited, or their link expired), then the ones already sent a link.
    const waiting = (v: WaitlistView) => !v.invite || v.invite.status === 'expired';
    return [...views.filter(waiting), ...views.filter((v) => !waiting(v))];
  }

  findWaitlistEntry(id: string): Promise<{ id: string; inviteId: string | null } | null> {
    return this.prisma.waitlistEntry.findUnique({ where: { id }, select: { id: true, inviteId: true } });
  }

  async inviteFromWaitlist(entryId: string, invite: NewInvite, now: Date): Promise<InviteView> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.invite.create({ data: invite, select: { id: true, ...INVITE } });
      await tx.waitlistEntry.update({ where: { id: entryId }, data: { inviteId: created.id } });
      const { id: _id, ...row } = created;
      return toView(row, now);
    });
  }
}
