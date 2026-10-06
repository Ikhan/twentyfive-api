import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { NotificationKey, NotificationsRepository } from './notifications.repository.js';
import type { DistrictPost, NewNotification, NotificationCursor, NotificationView } from './notifications.types.js';

const SELECT = {
  id: true,
  type: true,
  postId: true,
  commentId: true,
  excerpt: true,
  postCount: true,
  district: { select: { id: true, name: true } },
  readAt: true,
  createdAt: true,
  actor: { select: { id: true, username: true, displayName: true, avatarUrl: true, isPrivate: true } },
} as const satisfies Prisma.NotificationSelect;

type Row = Prisma.NotificationGetPayload<{ select: typeof SELECT }>;

const toView = ({ readAt, ...row }: Row): NotificationView => ({ ...row, read: readAt !== null });

const keyWhere = ({ postId, ...key }: NotificationKey): Prisma.NotificationWhereInput => ({
  ...key,
  postId: postId ?? null,
});

@Injectable()
export class PrismaNotificationsRepository implements NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(notification: NewNotification): Promise<void> {
    await this.prisma.notification.create({ data: notification });
  }

  /** One statement: update each recipient's unread group if they have one, otherwise start one. */
  async notifyDistrictFollowers({ districtId, authorId, postId, excerpt }: DistrictPost): Promise<void> {
    await this.prisma.$executeRaw`
      WITH recipients AS (
        SELECT f.user_id FROM district_follows f
        WHERE f.district_id = ${districtId} AND f.notify AND f.user_id <> ${authorId}::uuid
          AND NOT EXISTS (
            SELECT 1 FROM blocks b
            WHERE (b.blocker_id = f.user_id AND b.blocked_id = ${authorId}::uuid)
               OR (b.blocker_id = ${authorId}::uuid AND b.blocked_id = f.user_id)
          )
      ), grouped AS (
        UPDATE notifications n
        SET actor_id = ${authorId}::uuid, post_id = ${postId}::uuid, excerpt = ${excerpt},
            post_count = n.post_count + 1, created_at = now()
        FROM recipients r
        WHERE n.recipient_id = r.user_id AND n.type = 'DISTRICT_POST'
          AND n.district_id = ${districtId} AND n.read_at IS NULL
        RETURNING n.recipient_id
      )
      INSERT INTO notifications (id, recipient_id, actor_id, type, post_id, excerpt, district_id, post_count, created_at)
      SELECT gen_random_uuid(), r.user_id, ${authorId}::uuid, 'DISTRICT_POST', ${postId}::uuid, ${excerpt}, ${districtId}, 1, now()
      FROM recipients r
      WHERE r.user_id NOT IN (SELECT recipient_id FROM grouped)`;
  }

  async hasUnread(key: NotificationKey): Promise<boolean> {
    return (await this.prisma.notification.count({ where: { ...keyWhere(key), readAt: null } })) > 0;
  }

  async deleteMatching(key: NotificationKey): Promise<void> {
    await this.prisma.notification.deleteMany({ where: keyWhere(key) });
  }

  async deleteBetween(userA: string, userB: string): Promise<void> {
    await this.prisma.notification.deleteMany({
      where: {
        OR: [
          { recipientId: userA, actorId: userB },
          { recipientId: userB, actorId: userA },
        ],
      },
    });
  }

  async list(
    recipientId: string,
    { after, take }: { after?: NotificationCursor; take: number },
  ): Promise<NotificationView[]> {
    const t = after && new Date(after.t);
    const rows = await this.prisma.notification.findMany({
      where: {
        recipientId,
        ...(after && { OR: [{ createdAt: { lt: t } }, { createdAt: t, id: { lt: after.id } }] }),
      },
      select: SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    });
    return rows.map(toView);
  }

  unreadCount(recipientId: string): Promise<number> {
    return this.prisma.notification.count({ where: { recipientId, readAt: null } });
  }

  async markRead(recipientId: string, notificationId: string): Promise<boolean> {
    const exists = await this.prisma.notification.count({ where: { id: notificationId, recipientId } });
    if (!exists) return false;
    await this.prisma.notification.updateMany({
      where: { id: notificationId, recipientId, readAt: null },
      data: { readAt: new Date() },
    });
    return true;
  }

  async markAllRead(recipientId: string): Promise<void> {
    await this.prisma.notification.updateMany({ where: { recipientId, readAt: null }, data: { readAt: new Date() } });
  }
}
