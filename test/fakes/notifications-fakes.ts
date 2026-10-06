import { randomUUID } from 'node:crypto';
import type {
  NotificationKey,
  NotificationsRepository,
} from '../../src/modules/notifications/notifications.repository.js';
import type {
  DistrictPost,
  NewNotification,
  NotificationCursor,
  NotificationView,
} from '../../src/modules/notifications/notifications.types.js';

type Stored = NewNotification & { id: string; read: boolean; createdAt: Date; districtId?: string; postCount?: number };

export class InMemoryNotificationsRepository implements NotificationsRepository {
  stored: Stored[] = [];
  private clock = Date.parse('2026-09-01T00:00:00Z');

  private matches = (n: Stored, k: NotificationKey) =>
    n.recipientId === k.recipientId && n.actorId === k.actorId && n.type === k.type && n.postId === k.postId;

  async create(notification: NewNotification): Promise<void> {
    this.stored.push({ ...notification, id: randomUUID(), read: false, createdAt: new Date((this.clock += 60_000)) });
  }

  /** Who follows each district with the bell on (the real repository reads district_follows). */
  readonly districtBells = new Map<string, string[]>();

  async notifyDistrictFollowers({ districtId, authorId, postId, excerpt }: DistrictPost): Promise<void> {
    for (const recipientId of (this.districtBells.get(districtId) ?? []).filter((id) => id !== authorId)) {
      const open = this.stored.find((n) => n.recipientId === recipientId && n.districtId === districtId && !n.read);
      const latest = { actorId: authorId, postId, excerpt, createdAt: new Date((this.clock += 60_000)) };
      this.stored = open
        ? this.stored.map((n) => (n === open ? { ...n, ...latest, postCount: (n.postCount ?? 1) + 1 } : n))
        : [
            ...this.stored,
            { ...latest, recipientId, type: 'DISTRICT_POST', districtId, postCount: 1, id: randomUUID(), read: false },
          ];
    }
  }

  async hasUnread(key: NotificationKey): Promise<boolean> {
    return this.stored.some((n) => !n.read && this.matches(n, key));
  }

  async deleteMatching(key: NotificationKey): Promise<void> {
    this.stored = this.stored.filter((n) => !this.matches(n, key));
  }

  async deleteBetween(userA: string, userB: string): Promise<void> {
    this.stored = this.stored.filter(
      (n) => !((n.recipientId === userA && n.actorId === userB) || (n.recipientId === userB && n.actorId === userA)),
    );
  }

  async list(recipientId: string, { after, take }: { after?: NotificationCursor; take: number }) {
    const key = (n: Stored) => `${n.createdAt.toISOString()}|${n.id}`;
    return this.stored
      .filter((n) => n.recipientId === recipientId && (!after || key(n) < `${after.t}|${after.id}`))
      .toSorted((a, b) => key(b).localeCompare(key(a)))
      .slice(0, take)
      .map((n): NotificationView => ({
        id: n.id,
        type: n.type,
        actor: { id: n.actorId, username: n.actorId, displayName: n.actorId, avatarUrl: null, isPrivate: false },
        postId: n.postId ?? null,
        commentId: n.commentId ?? null,
        excerpt: n.excerpt ?? null,
        district: n.districtId ? { id: n.districtId, name: n.districtId } : null,
        postCount: n.postCount ?? 1,
        read: n.read,
        createdAt: n.createdAt,
      }));
  }

  async unreadCount(recipientId: string): Promise<number> {
    return this.stored.filter((n) => n.recipientId === recipientId && !n.read).length;
  }

  async markRead(recipientId: string, notificationId: string): Promise<boolean> {
    const found = this.stored.find((n) => n.id === notificationId && n.recipientId === recipientId);
    if (!found) return false;
    this.stored = this.stored.map((n) => (n === found ? { ...n, read: true } : n));
    return true;
  }

  async markAllRead(recipientId: string): Promise<void> {
    this.stored = this.stored.map((n) => (n.recipientId === recipientId ? { ...n, read: true } : n));
  }
}
