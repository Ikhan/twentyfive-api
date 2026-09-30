import type { CommentCursor, CommentOwnership, CommentRecord } from './comments.types.js';

export interface CommentsRepository {
  create(input: { postId: string; authorId: string; body: string }): Promise<CommentRecord>;
  /** Oldest first (a conversation), after `after`; hides comments across a block with `viewerId`. */
  list(postId: string, viewerId: string, page: { after?: CommentCursor; take: number }): Promise<CommentRecord[]>;
  findOwnership(commentId: string): Promise<CommentOwnership | null>;
  delete(commentId: string): Promise<void>;
}

export const COMMENTS_REPOSITORY = Symbol('COMMENTS_REPOSITORY');
