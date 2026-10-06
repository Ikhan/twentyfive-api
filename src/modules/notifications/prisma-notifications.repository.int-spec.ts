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

  describe('district posts', () => {
    const post = async (authorId: string, body: string) =>
      (await prisma.post.create({ data: { authorId, districtId: 'kandy', body } })).id;
    const announce = (actorId: string, postId: string, excerpt: string) =>
      repo.notifyDistrictFollowers({ districtId: 'kandy', authorId: actorId, postId, excerpt });
    const bell = (userId: string, notify = true) =>
      prisma.districtFollow.create({ data: { userId, districtId: 'kandy', notify } });

    it('groups new posts into one unread row per district, showing the newest', async () => {
      const dilan = (await prisma.user.create({ data: { username: 'dilan', displayName: 'Dilan' } })).id;
      await bell(kasun);
      await announce(arun, await post(arun, 'first'), 'first');
      const second = await post(dilan, 'second');
      await announce(dilan, second, 'second');
      const [n, ...rest] = await repo.list(kasun, { take: 10 });
      expect(rest).toEqual([]);
      expect(n).toMatchObject({
        type: 'DISTRICT_POST',
        actor: { username: 'dilan' },
        postId: second,
        excerpt: 'second',
        district: { id: 'kandy', name: 'Kandy' },
        postCount: 2,
        read: false,
      });
      expect(await repo.unreadCount(kasun)).toBe(1);
    });

    it('starts a new row once the group is read', async () => {
      await bell(kasun);
      await announce(arun, await post(arun, 'one'), 'one');
      await repo.markAllRead(kasun);
      await announce(arun, await post(arun, 'two'), 'two');
      const rows = await repo.list(kasun, { take: 10 });
      expect(rows.map((r) => [r.excerpt, r.postCount, r.read])).toEqual([
        ['two', 1, false],
        ['one', 1, true],
      ]);
    });

    it('skips the author, followers without the bell, and anyone across a block', async () => {
      const users = await Promise.all(
        ['quiet', 'blocker', 'blocked', 'stranger'].map((username) =>
          prisma.user.create({ data: { username, displayName: username } }),
        ),
      );
      const [quiet, blocker, blocked] = users.map((u) => u.id) as [string, string, string];
      await bell(arun); // the author
      await bell(quiet, false);
      await bell(blocker);
      await bell(blocked);
      await prisma.block.create({ data: { blockerId: blocker, blockedId: arun } });
      await prisma.block.create({ data: { blockerId: arun, blockedId: blocked } });
      await announce(arun, await post(arun, 'hello'), 'hello');
      expect(await prisma.notification.count()).toBe(0);
    });

    it('shows ordinary notifications without a district', async () => {
      await repo.create({ recipientId: kasun, actorId: arun, type: 'FOLLOW' });
      const [n] = await repo.list(kasun, { take: 1 });
      expect(n).toMatchObject({ district: null, postCount: 1 });
    });
  });
});
