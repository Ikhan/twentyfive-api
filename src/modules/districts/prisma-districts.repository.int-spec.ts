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
    expect(all.map((d) => d.name)).toEqual([...all.map((d) => d.name)].sort());
    expect((await districts.list(Province.UVA)).map((d) => d.id)).toEqual(['badulla', 'monaragala']);
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
});
