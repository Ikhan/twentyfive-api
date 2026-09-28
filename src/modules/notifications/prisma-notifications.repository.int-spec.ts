import { randomUUID } from 'node:crypto';
import { resetDatabase } from '../../../test/helpers/test-db.js';
import { testPrismaService } from '../../../test/helpers/test-prisma-service.js';
import { PrismaNotificationsRepository } from './prisma-notifications.repository.js';

describe('PrismaNotificationsRepository (integration)', () => {
  const prisma = testPrismaService();
  const repo = new PrismaNotificationsRepository(prisma);
  let kasun: string;
  let arun: string;
  let postId: string;

  beforeAll(() => prisma.onModuleInit());
  afterAll(() => prisma.onModuleDestroy());
  beforeEach(async () => {
    await resetDatabase(prisma);
    kasun = (await prisma.user.create({ data: { username: 'kasun', displayName: 'Kasun' } })).id;
    arun = (await prisma.user.create({ data: { username: 'arun', displayName: 'Arun' } })).id;
    postId = (await prisma.post.create({ data: { authorId: kasun, districtId: 'kandy', body: 'hi' } })).id;
  });

  it('stores and lists notifications with their actor, newest first', async () => {
    await repo.create({ recipientId: kasun, actorId: arun, type: 'FOLLOW' });
    await repo.create({ recipientId: kasun, actorId: arun, type: 'REPOST', postId });
    const [newest, oldest] = await repo.list(kasun, { take: 10 });
    expect(newest).toMatchObject({ type: 'REPOST', postId, read: false, actor: { username: 'arun' } });
    expect(oldest).toMatchObject({ type: 'FOLLOW', postId: null, commentId: null, excerpt: null });
    const rest = await repo.list(kasun, { take: 10, after: { t: newest!.createdAt.toISOString(), id: newest!.id } });
    expect(rest.map((n) => n.id)).toEqual([oldest!.id]);
  });

  it('finds unread duplicates by key, including posts', async () => {
    await repo.create({ recipientId: kasun, actorId: arun, type: 'REPOST', postId });
    expect(await repo.hasUnread({ recipientId: kasun, actorId: arun, type: 'REPOST', postId })).toBe(true);
    expect(await repo.hasUnread({ recipientId: kasun, actorId: arun, type: 'REPOST' })).toBe(false);
    await repo.markAllRead(kasun);
    expect(await repo.hasUnread({ recipientId: kasun, actorId: arun, type: 'REPOST', postId })).toBe(false);
  });

  it('counts, marks read only for the recipient, and deletes by key', async () => {
    await repo.create({ recipientId: kasun, actorId: arun, type: 'FOLLOW_REQUEST' });
    await repo.create({ recipientId: kasun, actorId: arun, type: 'FOLLOW' });
    const [n] = await repo.list(kasun, { take: 1 });
    expect(await repo.unreadCount(kasun)).toBe(2);
    expect(await repo.markRead(arun, n!.id)).toBe(false);
    expect(await repo.markRead(kasun, randomUUID())).toBe(false);
    expect(await repo.markRead(kasun, n!.id)).toBe(true);
    expect(await repo.markRead(kasun, n!.id)).toBe(true); // already read is fine
    expect(await repo.unreadCount(kasun)).toBe(1);
    await repo.deleteMatching({ recipientId: kasun, actorId: arun, type: 'FOLLOW_REQUEST' });
    expect((await repo.list(kasun, { take: 10 })).map((x) => x.type)).toEqual(['FOLLOW']);
  });

  it('disappears with the post or comment it is about', async () => {
    const comment = await prisma.comment.create({ data: { postId, authorId: arun, body: 'Nice' } });
    await repo.create({
      recipientId: kasun,
      actorId: arun,
      type: 'COMMENT',
      postId,
      commentId: comment.id,
      excerpt: 'Nice',
    });
    await prisma.comment.delete({ where: { id: comment.id } });
    expect(await repo.unreadCount(kasun)).toBe(0);
    await repo.create({ recipientId: kasun, actorId: arun, type: 'REPOST', postId });
    await prisma.post.delete({ where: { id: postId } });
    expect(await repo.unreadCount(kasun)).toBe(0);
  });
});
