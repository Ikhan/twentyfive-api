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
});
