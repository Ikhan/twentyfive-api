import type { UserSummary } from '../users/users.types.js';

/** How many unused invites someone may have out, plus the ones that were used. */
export const INVITES_PER_PERSON = 10;
/** Unused links stop working after this, and the slot comes back. */
export const INVITE_TTL_DAYS = 14;

export type InviteStatus = 'pending' | 'used' | 'expired';

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
  /** The invite sent to them, if any. */
  invite: { code: string; status: InviteStatus } | null;
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
