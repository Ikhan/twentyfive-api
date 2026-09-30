import { resetDatabase } from '../../../test/helpers/test-db.js';
import { testPrismaService } from '../../../test/helpers/test-prisma-service.js';
import { PrismaUsersRepository } from './prisma-users.repository.js';
import { UsernameTakenError } from './users.errors.js';

describe('PrismaUsersRepository (integration)', () => {
  const prisma = testPrismaService();
  const users = new PrismaUsersRepository(prisma);

  beforeAll(() => prisma.onModuleInit());
  afterAll(() => prisma.onModuleDestroy());
  beforeEach(() => resetDatabase(prisma));

  const insert = (username: string) =>
    prisma.user.create({ data: { username, displayName: username, email: `${username}@x.lk` } });

  it('finds by id and username with the hometown joined, never exposing email', async () => {
    const row = await insert('kasun');
    await prisma.user.update({ where: { id: row.id }, data: { hometownId: 'kandy', bio: 'hi' } });
    const byId = await users.findById(row.id);
    expect(byId).toEqual({
      id: row.id,
      username: 'kasun',
      displayName: 'kasun',
      bio: 'hi',
      avatarUrl: null,
      headerUrl: null,
      hometown: { id: 'kandy', name: 'Kandy' },
      isPrivate: false,
      onboarded: false,
      joinedAt: row.createdAt,
    });
    expect(byId).not.toHaveProperty('email');
    await expect(users.findByUsername('kasun')).resolves.toEqual(byId);
    await expect(users.findByUsername('nobody')).resolves.toBeNull();
  });

  it('checks username availability excluding yourself', async () => {
    const kasun = await insert('kasun');
    await expect(users.usernameTaken('kasun')).resolves.toBe(true);
    await expect(users.usernameTaken('kasun', kasun.id)).resolves.toBe(false);
    await expect(users.usernameTaken('free')).resolves.toBe(false);
  });

  it('knows which districts exist', async () => {
    await expect(users.districtExists('badulla')).resolves.toBe(true);
    await expect(users.districtExists('atlantis')).resolves.toBe(false);
  });

  it('updates the profile and stamps onboarding only when asked', async () => {
    const row = await insert('kasun');
    const edited = await users.update(row.id, { displayName: 'Kasun P', hometownId: 'galle', isPrivate: true });
    expect(edited).toMatchObject({
      displayName: 'Kasun P',
      hometown: { id: 'galle', name: 'Galle' },
      isPrivate: true,
      onboarded: false,
    });
    await expect(users.update(row.id, { username: 'kasun_p' }, { completeOnboarding: true })).resolves.toMatchObject({
      username: 'kasun_p',
      onboarded: true,
    });
  });

  it('turns a username race (unique index) into UsernameTakenError', async () => {
    await insert('taken');
    const other = await insert('other');
    await expect(users.update(other.id, { username: 'taken' })).rejects.toBeInstanceOf(UsernameTakenError);
  });

  it('rethrows other database errors', async () => {
    const row = await insert('kasun');
    await expect(users.update(row.id, { hometownId: 'atlantis' })).rejects.toThrow(); // foreign key
  });

  describe('search', () => {
    const person = (username: string, displayName = username) =>
      prisma.user.create({ data: { username, displayName, onboardedAt: new Date() } });
    const found = async (viewerId: string, q: string) => (await users.search(viewerId, q, 10)).map((u) => u.username);

    it('matches username or name-word prefixes, people you follow first, then usernames, then followers', async () => {
      const me = await person('kasun');
      const fan = await person('sam_a', 'Sam A');
      const followed = await person('zsam', 'Sam Z'); // matches by name only, but you follow them
      const popular = await person('samantha');
      await person('nisam', 'Nisam'); // "sam" is inside the name, not at the start of a word
      await prisma.user.create({ data: { username: 'samnew', displayName: 'samnew' } }); // not onboarded
      await prisma.follow.create({ data: { followerId: me.id, followeeId: followed.id, status: 'ACCEPTED' } });
      await prisma.follow.create({ data: { followerId: fan.id, followeeId: popular.id, status: 'ACCEPTED' } });
      expect(await found(me.id, 'sam')).toEqual(['zsam', 'samantha', 'sam_a']);
      expect(await users.search(me.id, 'sam', 1)).toEqual([
        { id: followed.id, username: 'zsam', displayName: 'Sam Z', avatarUrl: null, isPrivate: false },
      ]);
      expect((await found(me.id, '')).slice(0, 1)).toEqual(['zsam']); // nothing typed yet: who you follow
    });

    it('leaves out you and blocks either way, and treats % and _ literally', async () => {
      const me = await person('kasun');
      const blocked = await person('kamal');
      const blocker = await person('kanthi');
      await person('ka_ru');
      await person('kaxru');
      await prisma.block.create({ data: { blockerId: me.id, blockedId: blocked.id } });
      await prisma.block.create({ data: { blockerId: blocker.id, blockedId: me.id } });
      expect(await found(me.id, 'ka')).toEqual(['ka_ru', 'kaxru']);
      expect(await found(me.id, 'ka_')).toEqual(['ka_ru']);
      expect(await found(me.id, '%')).toEqual([]);
    });
  });
});
