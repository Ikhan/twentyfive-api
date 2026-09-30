import type { UserSummary } from '../users/users.types.js';

export interface CommentRecord {
  id: string;
  postId: string;
  /** The top-level comment this replies to; null for a top-level comment. */
  parentId: string | null;
  body: string;
  createdAt: Date;
  author: UserSummary;
  /** Replies the viewer can see (always 0 for a reply: replies go one level deep). */
  replyCount: number;
}

export interface CommentView extends CommentRecord {
  /** @handles in the comment that belong to real accounts, lowercase. */
  mentions: string[];
}

export interface NewComment {
  postId: string;
  authorId: string;
  body: string;
  /** Set for replies: a top-level comment on the same post. */
  parentId?: string | null;
}

export interface CommentOwnership {
  id: string;
  postId: string;
  /** Null for top-level comments. */
  parentId: string | null;
  authorId: string;
  postAuthorId: string;
}

export interface CommentCursor {
  t: string;
  id: string;
}
