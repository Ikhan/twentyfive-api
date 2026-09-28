import { resetDatabase } from '../../../test/helpers/test-db.js';
import { testPrismaService } from '../../../test/helpers/test-prisma-service.js';
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
    expect((await posts.findVisible(postId, kasun))!.counts).toEqual({ comments: 1 });
  });

  it('pages oldest first with ties broken by id', async () => {
    const at = new Date('2026-09-01T10:00:00Z');
    await prisma.comment.createMany({
      data: ['a', 'b', 'c'].map((body) => ({ postId, authorId: arun, body, createdAt: at })),
    });
    await prisma.comment.create({ data: { postId, authorId: arun, body: 'later', createdAt: new Date(+at + 1000) } });
    const first = await comments.list(postId, { take: 2 });
    const last = first.at(-1)!;
    const rest = await comments.list(postId, { take: 10, after: { t: last.createdAt.toISOString(), id: last.id } });
    const all = [...first, ...rest];
    expect(all).toHaveLength(4);
    expect(new Set(all.map((c) => c.id)).size).toBe(4);
    expect(all.at(-1)!.body).toBe('later');
  });

  it('reports ownership and deletes', async () => {
    const c = await comments.create({ postId, authorId: arun, body: 'Nice' });
    expect(await comments.findOwnership(c.id)).toEqual({ id: c.id, postId, authorId: arun, postAuthorId: kasun });
    await comments.delete(c.id);
    await comments.delete(c.id); // idempotent
    expect(await comments.findOwnership(c.id)).toBeNull();
  });

  it('removes comments with their post', async () => {
    await comments.create({ postId, authorId: arun, body: 'Nice' });
    await prisma.post.delete({ where: { id: postId } });
    expect(await prisma.comment.count()).toBe(0);
  });
});
