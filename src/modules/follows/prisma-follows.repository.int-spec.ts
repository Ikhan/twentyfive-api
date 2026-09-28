import { resetDatabase } from '../../../test/helpers/test-db.js';
import { testPrismaService } from '../../../test/helpers/test-prisma-service.js';
import { PrismaFollowsRepository } from './prisma-follows.repository.js';

describe('PrismaFollowsRepository (integration)', () => {
  const prisma = testPrismaService();
  const follows = new PrismaFollowsRepository(prisma);
  const ids: Record<string, string> = {};

  beforeAll(() => prisma.onModuleInit());
  afterAll(() => prisma.onModuleDestroy());
  beforeEach(async () => {
    await resetDatabase(prisma);
    for (const [username, isPrivate] of [
      ['kasun', false],
      ['tharushi', false],
      ['sachini', true],
      ['dilan', false],
    ] as const) {
      ids[username] = (await prisma.user.create({ data: { username, displayName: username, isPrivate } })).id;
    }
  });

  it('finds targets by username', async () => {
    await expect(follows.findTarget('sachini')).resolves.toEqual({
      id: ids.sachini,
      username: 'sachini',
      isPrivate: true,
    });
    await expect(follows.findTarget('nobody')).resolves.toBeNull();
  });

  it('creates without downgrading, reports status, removes', async () => {
    await follows.create(ids.kasun!, ids.tharushi!, 'ACCEPTED');
    await follows.create(ids.kasun!, ids.tharushi!, 'PENDING');
    await expect(follows.status(ids.kasun!, ids.tharushi!)).resolves.toBe('ACCEPTED');
    await follows.remove(ids.kasun!, ids.tharushi!);
    await follows.remove(ids.kasun!, ids.tharushi!);
    await expect(follows.status(ids.kasun!, ids.tharushi!)).resolves.toBeNull();
  });

  it('accepts one request or all of them', async () => {
    await follows.create(ids.kasun!, ids.sachini!, 'PENDING');
    await follows.create(ids.dilan!, ids.sachini!, 'PENDING');
    await follows.create(ids.tharushi!, ids.sachini!, 'PENDING');
    await expect(follows.accept(ids.kasun!, ids.sachini!)).resolves.toBe(true);
    await expect(follows.accept(ids.kasun!, ids.sachini!)).resolves.toBe(false);
    const approved = await follows.acceptAll(ids.sachini!);
    expect(approved.sort()).toEqual([ids.dilan, ids.tharushi].sort());
    await expect(follows.counts(ids.sachini!)).resolves.toEqual({ followers: 3, following: 0 });
    const row = await prisma.follow.findUnique({
      where: { followerId_followeeId: { followerId: ids.dilan!, followeeId: ids.sachini! } },
    });
    expect(row?.acceptedAt).toBeInstanceOf(Date);
  });

  it('counts and lists accepted connections and pending requests separately, by username', async () => {
    await follows.create(ids.tharushi!, ids.kasun!, 'ACCEPTED');
    await follows.create(ids.dilan!, ids.kasun!, 'ACCEPTED');
    await follows.create(ids.kasun!, ids.sachini!, 'PENDING');
    await follows.create(ids.kasun!, ids.tharushi!, 'ACCEPTED');

    await expect(follows.counts(ids.kasun!)).resolves.toEqual({ followers: 2, following: 1 });
    expect((await follows.followers(ids.kasun!, { take: 10 })).map((u) => u.username)).toEqual(['dilan', 'tharushi']);
    expect((await follows.followers(ids.kasun!, { afterUsername: 'dilan', take: 10 })).map((u) => u.username)).toEqual([
      'tharushi',
    ]);
    expect((await follows.following(ids.kasun!, { take: 10 })).map((u) => u.username)).toEqual(['tharushi']);
    expect((await follows.requests(ids.sachini!, { take: 10 })).map((u) => u.username)).toEqual(['kasun']);
    expect(await follows.requests(ids.kasun!, { take: 10 })).toEqual([]);
  });

  describe('suggestions', () => {
    const follow = (from: string, to: string, status: 'ACCEPTED' | 'PENDING' = 'ACCEPTED') =>
      follows.create(ids[from]!, ids[to]!, status);
    const person = async (username: string, data: { hometownId?: string; onboarded?: boolean } = {}) => {
      ids[username] = (
        await prisma.user.create({
          data: {
            username,
            displayName: username,
            hometownId: data.hometownId,
            onboardedAt: data.onboarded === false ? null : new Date(),
          },
        })
      ).id;
    };
    const suggested = async (take = 20) => (await follows.suggestions(ids.kasun!, take)).map((s) => s.username);

    beforeEach(async () => {
      await prisma.user.updateMany({ data: { onboardedAt: new Date() } });
      await prisma.user.update({ where: { id: ids.kasun }, data: { hometownId: 'kandy' } });
    });

    it('ranks follows-you over mutuals over hometown over a followed district, and says why', async () => {
      await person('fan');
      await person('mutual');
      await person('local', { hometownId: 'kandy' });
      await person('southern', { hometownId: 'galle' });
      await prisma.districtFollow.create({ data: { userId: ids.kasun!, districtId: 'galle' } });
      await follow('fan', 'kasun');
      await follow('kasun', 'tharushi');
      await follow('kasun', 'dilan');
      await follow('tharushi', 'mutual');
      await follow('dilan', 'mutual');
      const rows = await follows.suggestions(ids.kasun!, 4);
      expect(rows.map((r) => r.username)).toEqual(['mutual', 'fan', 'local', 'southern']); // 2 mutuals = 6 > 5
      expect(rows[0]).toMatchObject({ mutualCount: 2, mutualUsernames: ['dilan', 'tharushi'], followsYou: false });
      expect(rows[1]).toMatchObject({ followsYou: true, mutualCount: 0 });
      expect(rows[2]).toMatchObject({ sameHometown: true, hometown: { id: 'kandy', name: 'Kandy' } });
      expect(rows[3]).toMatchObject({ fromFollowedDistrict: true, sameHometown: false });
    });

    it('leaves out you, people you follow or asked to, blocks either way, and people not onboarded', async () => {
      await person('blocked');
      await person('blocker');
      await person('halfway', { onboarded: false });
      await follow('kasun', 'tharushi');
      await follow('kasun', 'sachini', 'PENDING');
      await prisma.block.create({ data: { blockerId: ids.kasun!, blockedId: ids.blocked! } });
      await prisma.block.create({ data: { blockerId: ids.blocker!, blockedId: ids.kasun! } });
      expect(await suggested()).toEqual(['dilan']);
    });

    it('doesn’t reveal who follows a private account', async () => {
      await follow('kasun', 'tharushi');
      await follow('tharushi', 'sachini');
      const [row] = await follows.suggestions(ids.kasun!, 20).then((r) => r.filter((s) => s.username === 'sachini'));
      expect(row).toMatchObject({ mutualCount: 0, mutualUsernames: [] });
    });

    it('breaks ties by recent posting, then followers, then newest', async () => {
      await follow('tharushi', 'sachini'); // sachini: 1 follower
      expect(await suggested()).toEqual(['sachini', 'dilan', 'tharushi']); // dilan is newer than tharushi
      await prisma.post.create({ data: { authorId: ids.tharushi!, body: 'hi' } });
      expect((await suggested(1))[0]).toBe('tharushi');
    });
  });
});
