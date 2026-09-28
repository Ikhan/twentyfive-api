import { randomUUID } from 'node:crypto';
import { resetDatabase } from '../../../test/helpers/test-db.js';
import { testPrismaService } from '../../../test/helpers/test-prisma-service.js';
import { PrismaCommentsRepository } from '../comments/prisma-comments.repository.js';
import { PrismaPostsRepository } from '../posts/prisma-posts.repository.js';
import { PrismaBlocksRepository } from './prisma-blocks.repository.js';
import { PrismaReportsRepository } from './prisma-reports.repository.js';

describe('Moderation repositories (integration)', () => {
  const prisma = testPrismaService();
  const blocks = new PrismaBlocksRepository(prisma);
  const reports = new PrismaReportsRepository(prisma);
  const posts = new PrismaPostsRepository(prisma);
  const comments = new PrismaCommentsRepository(prisma);
  const u: Record<string, string> = {};

  beforeAll(() => prisma.onModuleInit());
  afterAll(() => prisma.onModuleDestroy());
  beforeEach(async () => {
    await resetDatabase(prisma);
    for (const username of ['kasun', 'arun', 'dilan']) {
      u[username] = (await prisma.user.create({ data: { username, displayName: username } })).id;
    }
  });

  it('blocks once, checks both directions, unblocks and lists by username', async () => {
    expect(await blocks.findUser('arun')).toEqual({ id: u.arun, username: 'arun' });
    expect(await blocks.findUser('ghost')).toBeNull();
    expect(await blocks.block(u.kasun!, u.dilan!)).toBe(true);
    expect(await blocks.block(u.kasun!, u.dilan!)).toBe(false);
    await blocks.block(u.kasun!, u.arun!);
    expect(await blocks.isBlockedBetween(u.dilan!, u.kasun!)).toBe(true);
    expect(await blocks.isBlockedBetween(u.arun!, u.dilan!)).toBe(false);
    expect((await blocks.blocked(u.kasun!, { take: 10 })).map((x) => x.username)).toEqual(['arun', 'dilan']);
    expect((await blocks.blocked(u.kasun!, { take: 10, afterUsername: 'arun' })).map((x) => x.username)).toEqual([
      'dilan',
    ]);
    await blocks.unblock(u.kasun!, u.dilan!);
    await blocks.unblock(u.kasun!, u.dilan!);
    expect(await blocks.isBlockedBetween(u.kasun!, u.dilan!)).toBe(false);
  });

  it('hides posts and comments across a block, both ways', async () => {
    const mine = await posts.create({
      authorId: u.kasun!,
      body: 'k',
      districtId: 'kandy',
      audience: 'EVERYONE',
      photos: [],
    });
    const theirs = await posts.create({
      authorId: u.arun!,
      body: 'a',
      districtId: 'kandy',
      audience: 'EVERYONE',
      photos: [],
    });
    await comments.create({ postId: mine.id, authorId: u.arun!, body: 'from arun' });
    await comments.create({ postId: mine.id, authorId: u.dilan!, body: 'from dilan' });
    await blocks.block(u.arun!, u.kasun!);

    expect(await posts.findVisible(theirs.id, u.kasun!)).toBeNull();
    expect(await posts.findVisible(mine.id, u.arun!)).toBeNull();
    expect((await posts.list(u.kasun!, { kind: 'everything' }, { take: 10 })).map((p) => p.body)).toEqual(['k']);
    expect((await comments.list(mine.id, u.kasun!, { take: 10 })).map((c) => c.body)).toEqual(['from dilan']);
    expect(await comments.list(mine.id, u.dilan!, { take: 10 })).toHaveLength(2);
  });

  it('stores one report per reporter and target', async () => {
    const report = {
      reporterId: u.kasun!,
      targetType: 'USER' as const,
      targetId: u.arun!,
      reason: 'HARASSMENT' as const,
      details: 'rude',
    };
    await reports.create(report);
    await reports.create({ ...report, details: 'again' });
    expect(await prisma.report.findMany({ select: { details: true, status: true } })).toEqual([
      { details: 'rude', status: 'OPEN' },
    ]);
  });

  it('looks up comment posts and users', async () => {
    const post = await posts.create({
      authorId: u.kasun!,
      body: 'k',
      districtId: 'kandy',
      audience: 'EVERYONE',
      photos: [],
    });
    const comment = await comments.create({ postId: post.id, authorId: u.arun!, body: 'hi' });
    expect(await reports.commentPostId(comment.id)).toBe(post.id);
    expect(await reports.commentPostId(randomUUID())).toBeNull();
    expect(await reports.userExists(u.arun!)).toBe(true);
    expect(await reports.userExists(randomUUID())).toBe(false);
  });
});
