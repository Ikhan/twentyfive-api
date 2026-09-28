import { ForbiddenError, NotFoundError, ValidationError } from '../../common/errors/app-error.js';

export class PostNotFoundError extends NotFoundError {
  constructor() {
    super('This post isn’t available. It may have been deleted, or it’s only visible to followers.');
  }
}

export class EmptyPostError extends ValidationError {
  constructor() {
    super('Write something or add a photo.', { field: 'body' });
  }
}

export class NotYourPostError extends ForbiddenError {
  constructor() {
    super('You can only delete your own posts.');
  }
}

export class PrivateAccountError extends ForbiddenError {
  constructor(username: string) {
    super(`@${username}’s account is private. Follow them to see their posts.`);
  }
}

export class PhotoAlreadyUsedError extends ValidationError {
  constructor() {
    super('That photo is already on another post.', { field: 'mediaIds' });
  }
}

export class CannotQuoteError extends ForbiddenError {
  constructor() {
    super('Only public posts can be quoted.');
  }
}
