import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { approvalEmail } from './approval-email.js';
import { newInviteCode, normalizeInviteCode } from './invite-code.js';
import {
  AdminOnlyError,
  AlreadyJoinedError,
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
  inviteStatus,
  type InvitePreview,
  type InviteView,
  type MyInvites,
  type NewWaitlistEntry,
  type WaitlistApproval,
  type WaitlistContact,
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
  private readonly logger = new Logger(InvitesService.name);

  constructor(
    @Inject(INVITES_REPOSITORY) private readonly invites: InvitesRepository,
    @Inject(MAILER) private readonly mailer: Mailer,
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

  /**
   * Approves someone on the waitlist: makes their invite link and emails them a welcome with it. Approving
   * again re-sends the same link while it's unused, or a new one once it has expired. One entry at a time
   * for now; bulk approval can loop over this.
   */
  async approve(adminId: string, entryId: string): Promise<WaitlistApproval> {
    this.assertInviteOnly();
    await this.assertAdmin(adminId);
    const entry = await this.invites.findWaitlistEntry(entryId);
    if (!entry) throw new WaitlistEntryNotFoundError();
    const now = new Date();
    const current = entry.invite && inviteStatus(entry.invite, now);
    if (current === 'used') throw new AlreadyJoinedError();
    const invite =
      current === 'pending'
        ? await this.invites.approve(entryId, null, now)
        : await this.withFreshCode(adminId, now, (next) => this.invites.approve(entryId, next, now));
    return { invite, emailed: await this.emailApproval(entry, invite) };
  }

  /** True only if the email really went out. A failure doesn't undo the approval: the admin can send the link. */
  private async emailApproval(entry: WaitlistContact, invite: InviteView): Promise<boolean> {
    const link = `${this.config.get('WEB_APP_URL')}/invite/${invite.code}`;
    try {
      await this.mailer.send(
        approvalEmail({ name: entry.name, email: entry.email, link, expiresAt: invite.expiresAt }),
      );
    } catch (error) {
      this.logger.error(
        `Couldn’t email waitlist entry ${entry.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
    if (!this.mailer.delivers) return false;
    await this.invites.markEmailed(entry.id, new Date());
    return true;
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
