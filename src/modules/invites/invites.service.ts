import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { newInviteCode, normalizeInviteCode } from './invite-code.js';
import {
  AdminOnlyError,
  InviteNotFoundError,
  InvitesClosedError,
  NoInvitesLeftError,
  UnknownDistrictError,
  WaitlistEntryNotFoundError,
} from './invites.errors.js';
import { INVITES_REPOSITORY, type InvitesRepository, type NewInvite } from './invites.repository.js';
import {
  INVITE_TTL_DAYS,
  INVITES_PER_PERSON,
  type InvitePreview,
  type InviteView,
  type MyInvites,
  type NewWaitlistEntry,
  type WaitlistView,
} from './invites.types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A clash on a random 10-character code is vanishingly rare; a few tries is plenty. */
const CODE_ATTEMPTS = 3;

const isCodeClash = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/**
 * Invite-only sign-up: everyone can have a few invite links out at a time (admins: any number), and people
 * without one can join the waitlist for an admin to invite. All of it switches off with INVITE_ONLY=false.
 */
@Injectable()
export class InvitesService {
  constructor(
    @Inject(INVITES_REPOSITORY) private readonly invites: InvitesRepository,
    private readonly config: AppConfigService,
  ) {}

  get inviteOnly(): boolean {
    return this.config.get('INVITE_ONLY');
  }

  async mine(userId: string): Promise<MyInvites> {
    this.assertInviteOnly();
    const now = new Date();
    const admin = await this.invites.isAdmin(userId);
    const [invites, heldCount] = await Promise.all([
      this.invites.listByInviter(userId, now),
      admin ? Promise.resolve(0) : this.invites.countHeld(userId, now),
    ]);
    return {
      unlimited: admin,
      remaining: admin ? null : Math.max(0, INVITES_PER_PERSON - heldCount),
      admin,
      invites,
    };
  }

  async create(userId: string): Promise<InviteView> {
    this.assertInviteOnly();
    const limit = (await this.invites.isAdmin(userId)) ? null : INVITES_PER_PERSON;
    const now = new Date();
    const invite = await this.withFreshCode(userId, now, (next) => this.invites.createWithin(next, limit, now));
    if (!invite) throw new NoInvitesLeftError();
    return invite;
  }

  /** Who's inviting you, for the invite page. */
  async preview(rawCode: string): Promise<InvitePreview> {
    this.assertInviteOnly();
    const code = normalizeInviteCode(rawCode);
    const invite = code && (await this.invites.findOpen(code, new Date()));
    if (!invite) throw new InviteNotFoundError();
    return invite;
  }

  async joinWaitlist(entry: NewWaitlistEntry): Promise<void> {
    this.assertInviteOnly();
    if (entry.districtId && !(await this.invites.districtExists(entry.districtId))) throw new UnknownDistrictError();
    await this.invites.addToWaitlist({
      name: entry.name.trim(),
      email: entry.email.trim().toLowerCase(),
      ...(entry.districtId && { districtId: entry.districtId }),
    });
  }

  async waitlist(adminId: string): Promise<WaitlistView[]> {
    this.assertInviteOnly();
    await this.assertAdmin(adminId);
    return this.invites.listWaitlist(new Date());
  }

  /** A fresh invite link for someone on the waitlist, for the admin to send them. */
  async inviteFromWaitlist(adminId: string, entryId: string): Promise<InviteView> {
    this.assertInviteOnly();
    await this.assertAdmin(adminId);
    if (!(await this.invites.findWaitlistEntry(entryId))) throw new WaitlistEntryNotFoundError();
    const now = new Date();
    return this.withFreshCode(adminId, now, (next) => this.invites.inviteFromWaitlist(entryId, next, now));
  }

  async assertAdmin(userId: string): Promise<void> {
    if (!(await this.invites.isAdmin(userId))) throw new AdminOnlyError();
  }

  private assertInviteOnly(): void {
    if (!this.inviteOnly) throw new InvitesClosedError();
  }

  private async withFreshCode<T>(inviterId: string, now: Date, create: (invite: NewInvite) => Promise<T>): Promise<T> {
    const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * DAY_MS);
    for (let attempt = 1; ; attempt++) {
      try {
        return await create({ inviterId, code: newInviteCode(), expiresAt });
      } catch (error) {
        if (!isCodeClash(error) || attempt >= CODE_ATTEMPTS) throw error;
      }
    }
  }
}
