import type { NewNotification, NotificationCursor, NotificationType, NotificationView } from './notifications.types.js';

export interface NotificationKey {
  recipientId: string;
  actorId: string;
  type: NotificationType;
  postId?: string;
}

export interface NotificationsRepository {
  create(notification: NewNotification): Promise<void>;
  /** Whether an unread notification with the same key exists. */
  hasUnread(key: NotificationKey): Promise<boolean>;
  /** Deletes every notification with this key (read or not). */
  deleteMatching(key: NotificationKey): Promise<void>;
  /** Newest first, after `after`. */
  list(recipientId: string, page: { after?: NotificationCursor; take: number }): Promise<NotificationView[]>;
  unreadCount(recipientId: string): Promise<number>;
  /** False when the notification doesn't exist or isn't the recipient's. */
  markRead(recipientId: string, notificationId: string): Promise<boolean>;
  markAllRead(recipientId: string): Promise<void>;
}

export const NOTIFICATIONS_REPOSITORY = Symbol('NOTIFICATIONS_REPOSITORY');
