import type { CommentCursor, CommentOwnership, CommentView } from './comments.types.js';

export interface CommentsRepository {
  create(input: { postId: string; authorId: string; body: string }): Promise<CommentView>;
  /** Oldest first (a conversation), after `after`. */
  list(postId: string, page: { after?: CommentCursor; take: number }): Promise<CommentView[]>;
  findOwnership(commentId: string): Promise<CommentOwnership | null>;
  delete(commentId: string): Promise<void>;
}

export const COMMENTS_REPOSITORY = Symbol('COMMENTS_REPOSITORY');
