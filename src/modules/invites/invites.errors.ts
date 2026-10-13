import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../common/errors/app-error.js';

/** Invites and the waitlist only exist while sign-up is invite-only. */
export class InvitesClosedError extends NotFoundError {
  constructor() {
    super('twentyfive is open to everyone now: no invite needed.');
  }
}

export class InviteNotFoundError extends NotFoundError {
  constructor() {
    super('This invite link isn’t valid any more. It may have been used or expired.');
  }
}

export class NoInvitesLeftError extends ConflictError {
  constructor() {
    super('You’ve used all your invites. Unused links that expire come back to you.');
  }
}

export class AdminOnlyError extends ForbiddenError {
  constructor() {
    super('Only admins can do that.');
  }
}

export class UnknownDistrictError extends ValidationError {
  constructor() {
    super('Pick one of the 25 districts.');
  }
}

export class WaitlistEntryNotFoundError extends NotFoundError {
  constructor() {
    super('That waitlist entry doesn’t exist.');
  }
}

export class AlreadyJoinedError extends ConflictError {
  constructor() {
    super('They’ve already joined with their invite.');
  }
}

export class AccountNotFoundError extends NotFoundError {
  constructor() {
    super('No account with that username.');
  }
}

export class CannotBanSelfError extends ValidationError {
  constructor() {
    super('You can’t ban yourself.');
  }
}
