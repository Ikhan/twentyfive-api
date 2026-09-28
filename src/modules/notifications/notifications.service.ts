import { Inject, Injectable } from '@nestjs/common';
import type { Paginated } from '../../common/api-response.js';
import { decodeCursor, toPage } from '../../common/pagination/cursor.js';
import { BLOCK_CHECKER, type BlockChecker } from '../moderation/block-checker.js';
import { NotificationNotFoundError } from './notifications.errors.js';
import { NOTIFICATIONS_REPOSITORY, type NotificationsRepository } from './notifications.repository.js';
import type { NewNotification, NotificationCursor, NotificationView } from './notifications.types.js';

/** Types that say "X did this"; repeating them while unread adds nothing (e.g. follow, unfollow, follow). */
const DEDUPLICATED = new Set<NewNotification['type']>(['FOLLOW', 'FOLLOW_REQUEST', 'FOLLOW_ACCEPTED', 'REPOST']);

const isCursor = (v: unknown): v is NotificationCursor =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as NotificationCursor).t === 'string' &&
  typeof (v as NotificationCursor).id === 'string' &&
  !Number.isNaN(Date.parse((v as NotificationCursor).t));

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(NOTIFICATIONS_REPOSITORY) private readonly notifications: NotificationsRepository,
    @Inject(BLOCK_CHECKER) private readonly blocks: BlockChecker,
  ) {}

  /** Records a notification. Never about your own actions, or from someone across a block. */
  async notify(notification: NewNotification): Promise<void> {
    if (notification.recipientId === notification.actorId) return;
    if (await this.blocks.isBlockedBetween(notification.recipientId, notification.actorId)) return;
    if (DEDUPLICATED.has(notification.type) && (await this.notifications.hasUnread(notification))) return;
    await this.notifications.create(notification);
  }

  /** A request was answered: the "wants to follow you" notification is no longer actionable. */
  async clearFollowRequest(recipientId: string, actorId: string): Promise<void> {
    await this.notifications.deleteMatching({ recipientId, actorId, type: 'FOLLOW_REQUEST' });
  }

  /** After a block: neither sees notifications caused by the other. */
  async clearBetween(userA: string, userB: string): Promise<void> {
    await this.notifications.deleteBetween(userA, userB);
  }

  async list(recipientId: string, page: { cursor?: string; limit: number }): Promise<Paginated<NotificationView>> {
    const after = decodeCursor(page.cursor, isCursor);
    const rows = await this.notifications.list(recipientId, { after, take: page.limit + 1 });
    return toPage(
      rows,
      page.limit,
      (n) => n,
      (n): NotificationCursor => ({ t: n.createdAt.toISOString(), id: n.id }),
    );
  }

  async unreadCount(recipientId: string): Promise<{ count: number }> {
    return { count: await this.notifications.unreadCount(recipientId) };
  }

  async markRead(recipientId: string, notificationId: string): Promise<void> {
    if (!(await this.notifications.markRead(recipientId, notificationId))) throw new NotificationNotFoundError();
  }

  markAllRead(recipientId: string): Promise<void> {
    return this.notifications.markAllRead(recipientId);
  }
}
