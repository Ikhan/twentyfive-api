import { randomUUID } from 'node:crypto';
import { resetDatabase } from '../../../test/helpers/test-db.js';
import { testPrismaService } from '../../../test/helpers/test-prisma-service.js';
import { PostNotFoundError } from '../posts/posts.errors.js';
import { PrismaPostsRepository } from '../posts/prisma-posts.repository.js';
import { PrismaReactionsRepository } from './prisma-reactions.repository.js';

describe('PrismaReactionsRepository (integration)', () => {
  const prisma = testPrismaService();
  const reactions = new PrismaReactionsRepository(prisma);
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

  it('adds each reaction once and shows counts and viewer flags on the post', async () => {
    expect(await reactions.add('like', arun, postId)).toBe(true);
    expect(await reactions.add('like', arun, postId)).toBe(false);
    expect(await reactions.add('repost', arun, postId)).toBe(true);
    expect(await reactions.add('like', kasun, postId)).toBe(true);

    const forArun = (await posts.findVisible(postId, arun))!;
    expect(forArun.counts).toEqual({ comments: 0, likes: 2, reposts: 1 });
    expect(forArun.viewer).toEqual({ liked: true, reposted: true });
    const forKasun = (await posts.list(kasun, { kind: 'everything' }, { take: 10 }))[0]!;
    expect(forKasun.viewer).toEqual({ liked: true, reposted: false });
  });

  it('removes reactions, and removing twice is fine', async () => {
    await reactions.add('like', arun, postId);
    await reactions.add('repost', arun, postId);
    await reactions.remove('like', arun, postId);
    await reactions.remove('like', arun, postId);
    await reactions.remove('repost', arun, postId);
    expect((await posts.findVisible(postId, arun))!.counts).toEqual({ comments: 0, likes: 0, reposts: 0 });
  });

  it('reports a missing post as not found', async () => {
    await expect(reactions.add('like', arun, randomUUID())).rejects.toThrow(PostNotFoundError);
    await expect(reactions.add('repost', arun, randomUUID())).rejects.toThrow(PostNotFoundError);
  });

  it('removes reactions with their post', async () => {
    await reactions.add('like', arun, postId);
    await reactions.add('repost', arun, postId);
    await prisma.post.delete({ where: { id: postId } });
    expect((await prisma.postLike.count()) + (await prisma.repost.count())).toBe(0);
  });
});
