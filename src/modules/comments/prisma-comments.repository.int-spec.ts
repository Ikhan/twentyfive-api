import { resetDatabase } from '../../../test/helpers/test-db.js';
import { testPrismaService } from '../../../test/helpers/test-prisma-service.js';
import { PrismaMediaRepository } from '../media/prisma-media.repository.js';
import { PrismaPostsRepository } from '../posts/prisma-posts.repository.js';
import { PrismaCommentsRepository } from './prisma-comments.repository.js';

describe('PrismaCommentsRepository (integration)', () => {
  const prisma = testPrismaService();
  const comments = new PrismaCommentsRepository(prisma);
  const posts = new PrismaPostsRepository(prisma);
  let kasun: string;
  let arun: string;
  let postId: string;

  beforeAll(() => prisma.onModuleInit());
  afterAll(() => prisma.onModuleDestroy());
  beforeEach(async () => {
    await resetDatabase(prisma);
    kasun = (await prisma.user.create({ data: { username: 'kasun', displayName: 'Kasun' } })).id;
    arun = (await prisma.user.create({ data: { username: 'arun', displayName: 'Arun' } })).id;
    postId = (
      await posts.create({ authorId: kasun, body: 'hi', districtId: 'kandy', audience: 'EVERYONE', photos: [] })
    ).id;
  });

  it('creates comments with their author and counts them on the post', async () => {
    const c = await comments.create({ postId, authorId: arun, body: 'Nice' });
    expect(c).toMatchObject({ postId, body: 'Nice', author: { id: arun, username: 'arun', displayName: 'Arun' } });
    expect((await posts.findVisible(postId, kasun))!.counts).toMatchObject({ comments: 1 });
  });

  it('pages oldest first with ties broken by id', async () => {
    const at = new Date('2026-09-01T10:00:00Z');
    await prisma.comment.createMany({
      data: ['a', 'b', 'c'].map((body) => ({ postId, authorId: arun, body, createdAt: at })),
    });
    await prisma.comment.create({ data: { postId, authorId: arun, body: 'later', createdAt: new Date(+at + 1000) } });
    const first = await comments.list(postId, kasun, { take: 2 });
    const last = first.at(-1)!;
    const rest = await comments.list(postId, kasun, {
      take: 10,
      after: { t: last.createdAt.toISOString(), id: last.id },
    });
    const all = [...first, ...rest];
    expect(all).toHaveLength(4);
    expect(new Set(all.map((c) => c.id)).size).toBe(4);
    expect(all.at(-1)!.body).toBe('later');
  });

  it('reports ownership and deletes', async () => {
    const c = await comments.create({ postId, authorId: arun, body: 'Nice' });
    expect(await comments.findOwnership(c.id)).toEqual({
      id: c.id,
      postId,
      parentId: null,
      authorId: arun,
      postAuthorId: kasun,
    });
    await comments.delete(c.id);
    await comments.delete(c.id); // idempotent
    expect(await comments.findOwnership(c.id)).toBeNull();
  });

  it('keeps replies under their comment: listed separately, counted (minus blocks), and deleted with it', async () => {
    const top = await comments.create({ postId, authorId: arun, body: 'Top' });
    const blocked = (await prisma.user.create({ data: { username: 'troll', displayName: 'Troll' } })).id;
    const reply = await comments.create({ postId, authorId: kasun, body: 'Reply', parentId: top.id });
    await comments.create({ postId, authorId: blocked, body: 'Rude', parentId: top.id });
    await prisma.block.create({ data: { blockerId: kasun, blockedId: blocked } });
    expect(reply).toMatchObject({ parentId: top.id, replyCount: 0 });
    // Top level: only the comment, with the replies Kasun can see counted.
    expect((await comments.list(postId, kasun, { take: 10 })).map((c) => [c.body, c.replyCount])).toEqual([['Top', 1]]);
    expect((await comments.list(postId, arun, { take: 10 }))[0]!.replyCount).toBe(2);
    expect((await comments.list(postId, kasun, { take: 10, parentId: top.id })).map((c) => c.body)).toEqual(['Reply']);
    expect(await comments.findOwnership(reply.id)).toMatchObject({ parentId: top.id });
    // The post still counts every comment, replies included.
    expect((await posts.findVisible(postId, arun))!.counts.comments).toBe(3);
    await comments.delete(top.id);
    expect(await prisma.comment.count()).toBe(0);
  });

  it('removes comments with their post', async () => {
    await comments.create({ postId, authorId: arun, body: 'Nice' });
    await prisma.post.delete({ where: { id: postId } });
    expect(await prisma.comment.count()).toBe(0);
  });

  it('keeps a comment’s photos (in order) or video, and those uploads can’t be used again', async () => {
    const upload = async (purpose: 'POST_PHOTO' | 'POST_VIDEO') =>
      (
        await prisma.media.create({
          data: { ownerId: arun, purpose, status: 'READY', key: `k/${Math.random()}`, contentType: 'image/jpeg' },
        })
      ).id;
    const [p1, p2] = [await upload('POST_PHOTO'), await upload('POST_PHOTO')];
    const withPhotos = await comments.create({
      postId,
      authorId: arun,
      body: '',
      photos: [
        { mediaId: p2, url: 'https://cdn/2.jpg' },
        { mediaId: p1, url: 'https://cdn/1.jpg' },
      ],
    });
    expect(withPhotos.photos.map((p) => p.url)).toEqual(['https://cdn/2.jpg', 'https://cdn/1.jpg']);
    const v = await upload('POST_VIDEO');
    const withVideo = await comments.create({
      postId,
      authorId: arun,
      body: 'clip',
      video: { mediaId: v, url: 'https://cdn/v.mp4', durationSeconds: 12, width: 640, height: 360 },
    });
    expect(withVideo.video).toEqual({ id: v, url: 'https://cdn/v.mp4', durationSeconds: 12, width: 640, height: 360 });
    const listed = await comments.list(postId, kasun, { take: 10 });
    expect(listed.map((c) => [c.photos.length, c.video?.id ?? null])).toEqual([
      [2, null],
      [0, v],
    ]);
    const media = new PrismaMediaRepository(prisma);
    await expect(media.findReady(arun, [p1, v], 'POST_PHOTO')).resolves.toEqual([]);
    await expect(media.findReady(arun, [v], 'POST_VIDEO')).resolves.toEqual([]);
  });
});
