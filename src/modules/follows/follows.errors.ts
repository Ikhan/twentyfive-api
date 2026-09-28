import { ForbiddenError, NotFoundError, ValidationError } from '../../common/errors/app-error.js';

export class UserNotFoundError extends NotFoundError {
  constructor(username: string) {
    super(`@${username} doesn’t exist.`);
  }
}

export class CannotFollowSelfError extends ValidationError {
  constructor() {
    super('You can’t follow yourself.');
  }
}

export class PrivateConnectionsError extends ForbiddenError {
  constructor(username: string) {
    super(`@${username}’s account is private. Follow them to see who they follow.`);
  }
}

export class NoFollowRequestError extends NotFoundError {
  constructor(username: string) {
    super(`There’s no follow request from @${username}.`);
  }
}
