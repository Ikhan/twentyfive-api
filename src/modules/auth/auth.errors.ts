import { NotFoundError, UnauthorizedError } from '../../common/errors/app-error.js';

export class UnknownProviderError extends NotFoundError {
  constructor(provider: string) {
    super(`Sign-in with “${provider}” isn’t available.`);
  }
}

export class InvalidSessionError extends UnauthorizedError {
  constructor() {
    super('Your session has expired. Please sign in again.');
  }
}

/** Sign-in can't go ahead for a reason the web app explains (`/signin?error=<reason>`). */
export abstract class SignInRefusedError extends UnauthorizedError {
  abstract readonly reason: string;
}

/** Sign-up is invite-only and they came without an invite. */
export class InviteRequiredError extends SignInRefusedError {
  readonly reason = 'invite_required';
  constructor() {
    super('twentyfive is invite-only for now.');
  }
}

/** Their invite was used, expired, or never existed. */
export class InviteUnavailableError extends SignInRefusedError {
  readonly reason = 'invite_invalid';
  constructor() {
    super('That invite can’t be used any more.');
  }
}

export class AccountBannedError extends SignInRefusedError {
  readonly reason = 'banned';
  constructor() {
    super('This account has been banned.');
  }
}
