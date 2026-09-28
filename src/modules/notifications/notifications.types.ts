import type { UserSummary } from '../users/users.types.js';

export type NotificationType = 'FOLLOW' | 'FOLLOW_REQUEST' | 'FOLLOW_ACCEPTED' | 'COMMENT' | 'REPOST' | 'QUOTE';

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
  read: boolean;
  createdAt: Date;
}

export interface NotificationCursor {
  t: string;
  id: string;
}
