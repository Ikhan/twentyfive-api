import type { UserSummary } from '../users/users.types.js';

export interface CommentRecord {
  id: string;
  postId: string;
  body: string;
  createdAt: Date;
  author: UserSummary;
}

export interface CommentView extends CommentRecord {
  /** @handles in the comment that belong to real accounts, lowercase. */
  mentions: string[];
}

export interface CommentOwnership {
  id: string;
  postId: string;
  authorId: string;
  postAuthorId: string;
}

export interface CommentCursor {
  t: string;
  id: string;
}
