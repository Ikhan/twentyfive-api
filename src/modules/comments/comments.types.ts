import type { PostPhotoView, PostVideoView } from '../posts/posts.types.js';
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
  /** Like posts: up to 4 photos, or one video. */
  photos: PostPhotoView[];
  video: PostVideoView | null;
  likeCount: number;
  /** The signed-in viewer's own reaction. */
  viewer: { liked: boolean };
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
  photos?: { mediaId: string; url: string }[];
  video?: { mediaId: string; url: string; durationSeconds: number; width: number; height: number } | null;
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
