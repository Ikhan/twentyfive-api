import type { UserSummary } from '../users/users.types.js';

export interface CommentView {
  id: string;
  postId: string;
  body: string;
  createdAt: Date;
  author: UserSummary;
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
