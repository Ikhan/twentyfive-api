import type { UserSummary } from '../users/users.types.js';

/** How many unused invites someone may have out, plus the ones that were used. */
export const INVITES_PER_PERSON = 10;
/** Unused links stop working after this, and the slot comes back. */
export const INVITE_TTL_DAYS = 14;

export type InviteStatus = 'pending' | 'used' | 'expired';

export function inviteStatus(invite: { usedAt: Date | null; expiresAt: Date }, now: Date): InviteStatus {
  if (invite.usedAt) return 'used';
  return invite.expiresAt <= now ? 'expired' : 'pending';
}

export interface InviteView {
  code: string;
  status: InviteStatus;
  createdAt: Date;
  expiresAt: Date;
  /** Who signed up with it. */
  usedBy: UserSummary | null;
  usedAt: Date | null;
}

export interface MyInvites {
  /** Admins have no limit. */
  unlimited: boolean;
  /** Null when unlimited. */
  remaining: number | null;
  /** Can see the waitlist and flagged accounts, and ban. */
  admin: boolean;
  invites: InviteView[];
}

/** What the invite page shows before sign-in: who's inviting you. */
export interface InvitePreview {
  inviter: UserSummary;
  expiresAt: Date;
}

export interface WaitlistView {
  id: string;
  name: string;
  email: string;
  district: { id: string; name: string } | null;
  createdAt: Date;
  /** When an admin approved them. */
  approvedAt: Date | null;
  /** When the approval email last went out (null while email isn't set up). */
  emailedAt: Date | null;
  /** Their invite link's code, once approved. */
  invite: { code: string; status: InviteStatus } | null;
}

/** A waitlist entry the admin is approving: who to email, and any invite they already have. */
export interface WaitlistContact {
  id: string;
  name: string;
  email: string;
  invite: { code: string; usedAt: Date | null; expiresAt: Date } | null;
}

export interface WaitlistApproval {
  invite: InviteView;
  /** Whether the welcome email actually went out (false while email isn't set up: send the link yourself). */
  emailed: boolean;
}

export interface FlaggedUser {
  user: UserSummary;
  flaggedAt: Date;
  reason: string;
  invitedBy: UserSummary | null;
}

export interface NewWaitlistEntry {
  name: string;
  email: string;
  districtId?: string;
}
