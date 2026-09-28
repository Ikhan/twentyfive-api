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
