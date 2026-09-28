import { ForbiddenError, NotFoundError } from '../../common/errors/app-error.js';

export class CommentNotFoundError extends NotFoundError {
  constructor() {
    super('Comment not found.');
  }
}

export class CannotDeleteCommentError extends ForbiddenError {
  constructor() {
    super('Only the comment’s author or the post’s author can delete it.');
  }
}
