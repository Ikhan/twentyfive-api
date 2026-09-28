import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { NotificationKey, NotificationsRepository } from './notifications.repository.js';
import type { NewNotification, NotificationCursor, NotificationView } from './notifications.types.js';

const SELECT = {
  id: true,
  type: true,
  postId: true,
  commentId: true,
  excerpt: true,
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
