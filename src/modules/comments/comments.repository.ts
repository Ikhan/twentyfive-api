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
  findOwnership(commentId: string): Promise<CommentOwnership | null>;
  /** Also deletes its replies. */
  delete(commentId: string): Promise<void>;
}

export const COMMENTS_REPOSITORY = Symbol('COMMENTS_REPOSITORY');
