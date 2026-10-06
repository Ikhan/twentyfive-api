import type { UserSummary } from '../users/users.types.js';

export type NotificationType =
  | 'FOLLOW'
  | 'FOLLOW_REQUEST'
  | 'FOLLOW_ACCEPTED'
  | 'COMMENT'
  | 'REPOST'
  | 'QUOTE'
  | 'MENTION'
  | 'REPLY'
  | 'DISTRICT_POST';

export interface NewNotification {
  recipientId: string;
  actorId: string;
  type: NotificationType;
  postId?: string;
  commentId?: string;
  excerpt?: string;
}

export interface NotificationView {
  id: string;
  type: NotificationType;
  actor: UserSummary;
  postId: string | null;
  commentId: string | null;
  excerpt: string | null;
  /** DISTRICT_POST: where the posts are (null for other types). */
  district: { id: string; name: string } | null;
  /** DISTRICT_POST: how many new posts the row stands for; `actor`, `postId` and `excerpt` are the newest. */
  postCount: number;
  read: boolean;
  createdAt: Date;
}

/** A new public post in a district, to tell its followers who have the bell on. */
export interface DistrictPost {
  districtId: string;
  authorId: string;
  postId: string;
  excerpt: string;
}

export interface NotificationCursor {
  t: string;
  id: string;
}
