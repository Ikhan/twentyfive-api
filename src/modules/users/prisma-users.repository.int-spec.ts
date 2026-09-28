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
});
