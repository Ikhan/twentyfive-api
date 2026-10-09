import type { CommentCursor, CommentOwnership, CommentRecord, NewComment } from './comments.types.js';

export interface CommentsRepository {
  create(input: NewComment): Promise<CommentRecord>;
  /**
   * Oldest first (a conversation), after `after`; hides comments across a block with `viewerId`.
   * `parentId` null: the post's top-level comments; otherwise that comment's replies.
   */
  list(
    postId: string,
    viewerId: string,
    page: { after?: CommentCursor; take: number; parentId?: string | null },
  ): Promise<CommentRecord[]>;
  /** One comment as `viewerId` sees it; null if it doesn't exist or is across a block with them. */
  find(commentId: string, viewerId: string): Promise<CommentRecord | null>;
  findOwnership(commentId: string): Promise<CommentOwnership | null>;
  /** Like (`on`) or unlike; idempotent. */
  setLike(commentId: string, userId: string, on: boolean): Promise<void>;
  /** Also deletes its replies. */
  delete(commentId: string): Promise<void>;
}

export const COMMENTS_REPOSITORY = Symbol('COMMENTS_REPOSITORY');
