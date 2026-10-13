import type { FlaggedUser, InvitePreview, InviteView, NewWaitlistEntry, WaitlistView } from './invites.types.js';

export interface NewInvite {
  inviterId: string;
  code: string;
  expiresAt: Date;
}

/** Persistence for invites and the waitlist. */
export interface InvitesRepository {
  isAdmin(userId: string): Promise<boolean>;
  /** Someone's invites, newest first. */
  listByInviter(inviterId: string, now: Date): Promise<InviteView[]>;
  /** Invites someone holds against their limit: used ones, and unused ones that haven't expired. */
  countHeld(inviterId: string, now: Date): Promise<number>;
  /**
   * Creates the invite if the inviter holds fewer than `limit` (null: no limit), checked and created
   * together so two quick clicks can't go over. Null when at the limit.
   */
  createWithin(invite: NewInvite, limit: number | null, now: Date): Promise<InviteView | null>;
  /** An unused, unexpired invite from someone who isn't banned. */
  findOpen(code: string, now: Date): Promise<InvitePreview | null>;
  /** Adds them to the waitlist; signing up again with the same email changes nothing. */
  addToWaitlist(entry: NewWaitlistEntry): Promise<void>;
  districtExists(districtId: string): Promise<boolean>;
  /** Not yet invited first, then oldest first. */
  listWaitlist(now: Date): Promise<WaitlistView[]>;
  findWaitlistEntry(id: string): Promise<{ id: string; inviteId: string | null } | null>;
  /** Creates an invite from the admin and links it to the entry (replacing any earlier one). */
  inviteFromWaitlist(entryId: string, invite: NewInvite, now: Date): Promise<InviteView>;
}

/** Persistence for admin actions on accounts. */
export interface AdminRepository {
  findUserId(username: string): Promise<string | null>;
  /**
   * Bans them: ends their sessions, expires their unused invites, and flags the people they invited
   * (with `reason`) for review. All or nothing.
   */
  ban(userId: string, reason: string, now: Date): Promise<void>;
  unban(userId: string): Promise<void>;
  clearFlag(userId: string): Promise<void>;
  /** Flagged accounts that aren't banned, most recent first. */
  listFlagged(): Promise<FlaggedUser[]>;
}

export const INVITES_REPOSITORY = Symbol('INVITES_REPOSITORY');
export const ADMIN_REPOSITORY = Symbol('ADMIN_REPOSITORY');
