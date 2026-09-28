import { resetDatabase } from '../../../test/helpers/test-db.js';
import { testPrismaService } from '../../../test/helpers/test-prisma-service.js';
import { Province } from '../../generated/prisma/enums.js';
import { PrismaDistrictsRepository } from './prisma-districts.repository.js';

describe('PrismaDistrictsRepository (integration)', () => {
  const prisma = testPrismaService();
  const districts = new PrismaDistrictsRepository(prisma);

  beforeAll(() => prisma.onModuleInit());
  afterAll(() => prisma.onModuleDestroy());
  beforeEach(() => resetDatabase(prisma));

  const user = (username: string, hometownId?: string, onboarded = true) =>
    prisma.user.create({
      data: { username, displayName: username, hometownId, onboardedAt: onboarded ? new Date() : null },
    });

  it('lists all 25 A–Z, or one province', async () => {
    const all = await districts.list();
    expect(all).toHaveLength(25);
    expect(all.map((d) => d.name)).toEqual(all.map((d) => d.name).sort());
    expect((await districts.list(Province.UVA)).map((d) => d.id)).toEqual(['badulla', 'monaragala']);
  });

  it('counts followers per district and knows which the viewer follows, in two queries', async () => {
    const a = (await user('a', 'kandy')).id;
    const b = (await user('b', 'galle')).id;
    await districts.follow(a, 'kandy');
    await districts.follow(b, 'kandy');
    await districts.follow(b, 'galle');
    const states = await districts.followStates(a);
    expect(states.get('kandy')).toEqual({ followerCount: 2, followedByMe: true });
    expect(states.get('galle')).toEqual({ followerCount: 1, followedByMe: false });
    expect(states.get('jaffna')).toBeUndefined(); // no followers: callers default to 0
    expect((await districts.followStates()).get('kandy')).toEqual({ followerCount: 2, followedByMe: false });
  });

  it('finds one district', async () => {
    await expect(districts.findById('kandy')).resolves.toMatchObject({
      name: 'Kandy',
      province: 'CENTRAL',
      colorFrom: expect.stringMatching(/^#/),
    });
    await expect(districts.findById('atlantis')).resolves.toBeNull();
  });

  it('follows and unfollows idempotently and counts followers', async () => {
    const a = await user('a');
    const b = await user('b');
    await districts.follow(a.id, 'kandy');
    await districts.follow(a.id, 'kandy');
    await districts.follow(b.id, 'kandy');
    await expect(districts.followerCount('kandy')).resolves.toBe(2);
    await expect(districts.isFollowing(a.id, 'kandy')).resolves.toBe(true);
    await districts.unfollow(a.id, 'kandy');
    await districts.unfollow(a.id, 'kandy');
    await expect(districts.isFollowing(a.id, 'kandy')).resolves.toBe(false);
    await expect(districts.followerCount('kandy')).resolves.toBe(1);
  });

  it('lists onboarded residents in username order, paged by username', async () => {
    await user('chamari', 'kandy');
    await user('arun', 'kandy');
    await user('bala', 'kandy');
    await user('notyet', 'kandy', false);
    await user('galleperson', 'galle');
    const first = await districts.residents('kandy', { take: 2 });
    expect(first.map((u) => u.username)).toEqual(['arun', 'bala']);
    expect(first[0]).toEqual({
      id: expect.any(String),
      username: 'arun',
      displayName: 'arun',
      avatarUrl: null,
      isPrivate: false,
    });
    expect((await districts.residents('kandy', { afterUsername: 'bala', take: 5 })).map((u) => u.username)).toEqual([
      'chamari',
    ]);
  });

  describe('activity', () => {
    const HOUR = 3_600_000;
    const ago = (hours: number) => new Date(Date.now() - hours * HOUR);
    const post = (authorId: string, districtId: string | null, extra: object = {}) =>
      prisma.post.create({ data: { authorId, districtId, body: 'hi', ...extra } });
    const byId = async (since: Date, halfLife = 1e9) =>
      new Map((await districts.activity(since, halfLife)).map((a) => [a.districtId, a]));

    it('weighs public posts, comments, likes, reposts, quotes and new followers per district', async () => {
      const a = (await user('a')).id;
      const b = (await user('b')).id;
      const p = await post(a, 'kandy');
      await prisma.comment.create({ data: { postId: p.id, authorId: b, body: 'nice' } });
      await prisma.postLike.create({ data: { postId: p.id, userId: b } });
      await prisma.repost.create({ data: { postId: p.id, userId: b } });
      await post(b, null, { isQuote: true, quotedPostId: p.id }); // quote of a Kandy post, itself in no district
      await districts.follow(b, 'galle');
      const activity = await byId(ago(24)); // a huge half-life: no decay
      // post 3 + comment 2 + like 1 + repost 2 + quote 2
      expect(activity.get('kandy')).toEqual({ districtId: 'kandy', posts: 1, score: expect.closeTo(10, 3) });
      expect(activity.get('galle')).toEqual({ districtId: 'galle', posts: 0, score: expect.closeTo(2, 3) });
      expect(activity.size).toBe(2);
    });

    it('leaves out follower-only posts, private accounts, and anything before `since`', async () => {
      const a = (await user('a')).id;
      const hidden = (await prisma.user.create({ data: { username: 'hid', displayName: 'hid', isPrivate: true } })).id;
      const followersOnly = await post(a, 'kandy', { audience: 'FOLLOWERS' });
      await prisma.postLike.create({ data: { postId: followersOnly.id, userId: a } });
      await post(hidden, 'kandy');
      await post(a, 'galle', { createdAt: ago(30) });
      await expect(districts.activity(ago(24), 12)).resolves.toEqual([]);
      expect((await byId(ago(48))).get('galle')?.posts).toBe(1);
    });

    it('halves each event’s weight every half-life', async () => {
      const a = (await user('a')).id;
      await post(a, 'kandy', { createdAt: ago(12) });
      expect((await byId(ago(24), 12)).get('kandy')?.score).toBeCloseTo(1.5, 2);
    });
  });
});
