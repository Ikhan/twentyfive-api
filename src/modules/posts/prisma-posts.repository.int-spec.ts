import { randomUUID } from 'node:crypto';
import { resetDatabase } from '../../../test/helpers/test-db.js';
import { testPrismaService } from '../../../test/helpers/test-prisma-service.js';
import { PhotoAlreadyUsedError } from './posts.errors.js';
import { PrismaPostsRepository } from './prisma-posts.repository.js';
import type { PostRecord } from './posts.types.js';

describe('PrismaPostsRepository (integration)', () => {
  const prisma = testPrismaService();
  const posts = new PrismaPostsRepository(prisma);
  const u: Record<string, string> = {};

  beforeAll(() => prisma.onModuleInit());
  afterAll(() => prisma.onModuleDestroy());
  beforeEach(async () => {
    await resetDatabase(prisma);
    for (const [username, isPrivate] of [
      ['kasun', false],
      ['sachini', true],
      ['arun', false],
      ['fan', false],
      ['pending', false],
    ] as const) {
      u[username] = (await prisma.user.create({ data: { username, displayName: username, isPrivate } })).id;
    }
    await prisma.follow.createMany({
      data: [
        { followerId: u.fan!, followeeId: u.kasun!, status: 'ACCEPTED' },
        { followerId: u.fan!, followeeId: u.sachini!, status: 'ACCEPTED' },
        { followerId: u.pending!, followeeId: u.sachini!, status: 'PENDING' },
      ],
    });
  });

  const post = (
    author: string,
    body: string,
    extra: { audience?: 'EVERYONE' | 'FOLLOWERS'; districtId?: string } = {},
  ) =>
    posts.create({
      authorId: u[author]!,
      body,
      districtId: extra.districtId ?? 'kandy',
      audience: extra.audience ?? 'EVERYONE',
      photos: [],
    });
  const bodies = (list: PostRecord[]) => list.map((p) => p.body);

  it('embeds the quoted post for each viewer, and says when it’s unavailable', async () => {
    const original = await post('kasun', 'Perahera tonight');
    const quote = await posts.create({
      authorId: u.arun!,
      body: 'Wish I was there',
      districtId: null,
      audience: 'EVERYONE',
      photos: [],
      quotedPostId: original.id,
    });
    expect(quote.quoted).toMatchObject({
      available: true,
      id: original.id,
      body: 'Perahera tonight',
      author: { username: 'kasun' },
      district: { id: 'kandy' },
    });
    expect((await posts.findVisible(original.id, u.fan!))!.counts.quotes).toBe(1);

    // Someone Kasun blocked sees the quote, but not the quoted post.
    await prisma.block.create({ data: { blockerId: u.kasun!, blockedId: u.pending! } });
    expect((await posts.findVisible(quote.id, u.pending!))!.quoted).toEqual({ available: false });

    // Deleted originals leave the quote saying so.
    await posts.delete(original.id);
    expect((await posts.findVisible(quote.id, u.fan!))!.quoted).toEqual({ available: false });
    expect((await post('arun', 'plain')).quoted).toBeNull();
  });

  it('creates a post without a district', async () => {
    const created = await posts.create({
      authorId: u.kasun!,
      body: 'all of us',
      districtId: null,
      audience: 'EVERYONE',
      photos: [],
    });
    expect(created.district).toBeNull();
    expect((await posts.findVisible(created.id, u.arun!))!.district).toBeNull();
  });

  it('creates a post with its author, district colours and ordered photos', async () => {
    const mediaIds = [randomUUID(), randomUUID()];
    for (const id of mediaIds) {
      await prisma.media.create({
        data: {
          id,
          ownerId: u.kasun!,
          purpose: 'POST_PHOTO',
          status: 'READY',
          key: `k/${id}`,
          contentType: 'image/jpeg',
        },
      });
    }
    const created = await posts.create({
      authorId: u.kasun!,
      body: 'Perahera',
      districtId: 'kandy',
      audience: 'EVERYONE',
      photos: [
        { mediaId: mediaIds[1]!, url: 'https://cdn/2.jpg' },
        { mediaId: mediaIds[0]!, url: 'https://cdn/1.jpg' },
      ],
    });
    expect(created).toMatchObject({
      body: 'Perahera',
      author: { username: 'kasun', isPrivate: false },
      district: { id: 'kandy', name: 'Kandy', colors: [expect.stringMatching(/^#/), expect.stringMatching(/^#/)] },
      photos: [{ url: 'https://cdn/2.jpg' }, { url: 'https://cdn/1.jpg' }],
    });
    await expect(
      posts.create({
        authorId: u.arun!,
        body: 'reuse',
        districtId: 'kandy',
        audience: 'EVERYONE',
        photos: [{ mediaId: mediaIds[0]!, url: 'x' }],
      }),
    ).rejects.toBeInstanceOf(PhotoAlreadyUsedError);
    await expect(
      posts.create({
        authorId: u.arun!,
        body: 'bad district',
        districtId: 'atlantis',
        audience: 'EVERYONE',
        photos: [],
      }),
    ).rejects.toThrow();
  });

  it('enforces the visibility matrix', async () => {
    const open = await post('kasun', 'public');
    const friends = await post('kasun', 'followers-only', { audience: 'FOLLOWERS' });
    const privateAccount = await post('sachini', 'private account');

    const sees = async (viewer: string) => {
      const found = await Promise.all([open, friends, privateAccount].map((p) => posts.findVisible(p.id, u[viewer]!)));
      return found.filter(Boolean).map((p) => p!.body);
    };
    expect(await sees('kasun')).toEqual(['public', 'followers-only']);
    expect(await sees('sachini')).toEqual(['public', 'private account']);
    expect(await sees('fan')).toEqual(['public', 'followers-only', 'private account']);
    expect(await sees('arun')).toEqual(['public']);
    expect(await sees('pending')).toEqual(['public']); // a pending request isn't access
  });

  it('applies visibility to every list scope', async () => {
    await post('kasun', 'kasun public');
    await post('kasun', 'kasun friends', { audience: 'FOLLOWERS' });
    await post('sachini', 'sachini private');
    await post('arun', 'arun galle', { districtId: 'galle' });

    expect(bodies(await posts.list(u.arun!, { kind: 'everything' }, { take: 10 }))).toEqual([
      'arun galle',
      'kasun public',
    ]);
    expect(bodies(await posts.list(u.fan!, { kind: 'everything' }, { take: 10 }))).toEqual([
      'arun galle',
      'sachini private',
      'kasun friends',
      'kasun public',
    ]);
    expect(bodies(await posts.list(u.arun!, { kind: 'district', districtId: 'kandy' }, { take: 10 }))).toEqual([
      'kasun public',
    ]);
    expect(bodies(await posts.list(u.arun!, { kind: 'author', authorId: u.sachini! }, { take: 10 }))).toEqual([]);
    expect(bodies(await posts.list(u.fan!, { kind: 'author', authorId: u.sachini! }, { take: 10 }))).toEqual([
      'sachini private',
    ]);
  });

  it('Following = people you follow, districts you follow, and yourself', async () => {
    await post('kasun', 'from kasun');
    await post('arun', 'arun in galle', { districtId: 'galle' });
    await post('arun', 'arun in kandy');
    await post('fan', 'my own');

    expect(bodies(await posts.list(u.fan!, { kind: 'following' }, { take: 10 }))).toEqual(['my own', 'from kasun']);
    await prisma.districtFollow.create({ data: { userId: u.fan!, districtId: 'galle' } });
    expect(bodies(await posts.list(u.fan!, { kind: 'following' }, { take: 10 }))).toEqual([
      'my own',
      'arun in galle',
      'from kasun',
    ]);
  });

  it('keyset-paginates newest first, even with identical timestamps', async () => {
    const t = new Date('2026-09-01T10:00:00Z');
    const ids = [randomUUID(), randomUUID(), randomUUID()].sort();
    for (const [i, id] of ids.entries()) {
      await prisma.post.create({
        data: { id, authorId: u.kasun!, districtId: 'kandy', body: `same-time ${i}`, createdAt: t },
      });
    }
    await prisma.post.create({
      data: { authorId: u.kasun!, districtId: 'kandy', body: 'newest', createdAt: new Date('2026-09-02T00:00:00Z') },
    });

    const page1 = await posts.list(u.arun!, { kind: 'everything' }, { take: 2 });
    expect(bodies(page1)).toEqual(['newest', 'same-time 2']);
    const last = page1.at(-1)!;
    const page2 = await posts.list(
      u.arun!,
      { kind: 'everything' },
      { after: { t: last.createdAt.toISOString(), id: last.id }, take: 5 },
    );
    expect(bodies(page2)).toEqual(['same-time 1', 'same-time 0']);
  });

  it('finds authors, checks follows, deletes idempotently', async () => {
    const created = await post('kasun', 'bye');
    await expect(posts.findAuthorId(created.id)).resolves.toBe(u.kasun);
    await expect(posts.findAuthor('sachini')).resolves.toEqual({ id: u.sachini, username: 'sachini', isPrivate: true });
    await expect(posts.findAuthor('nobody')).resolves.toBeNull();
    await expect(posts.isApprovedFollower(u.fan!, u.sachini!)).resolves.toBe(true);
    await expect(posts.isApprovedFollower(u.pending!, u.sachini!)).resolves.toBe(false);
    await expect(posts.districtExists('galle')).resolves.toBe(true);
    await expect(posts.districtExists('atlantis')).resolves.toBe(false);
    await posts.delete(created.id);
    await posts.delete(created.id);
    await expect(posts.findAuthorId(created.id)).resolves.toBeNull();
  });

  it('finds onboarded accounts by username, for mentions', async () => {
    await prisma.user.updateMany({ where: { username: { in: ['kasun', 'arun'] } }, data: { onboardedAt: new Date() } });
    const found = await posts.findUsersByUsernames(['kasun', 'arun', 'sachini', 'ghost']);
    expect(found.map((x) => x.username).sort()).toEqual(['arun', 'kasun']); // sachini hasn't finished signing up
    expect(found.find((x) => x.username === 'kasun')).toEqual({ id: u.kasun, username: 'kasun' });
  });
});
