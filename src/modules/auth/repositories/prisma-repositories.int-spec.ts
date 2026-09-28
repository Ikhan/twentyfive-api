import { randomUUID } from 'node:crypto';
import { resetDatabase } from '../../../../test/helpers/test-db.js';
import { testPrismaService } from '../../../../test/helpers/test-prisma-service.js';
import { OAuthProvider } from '../../../generated/prisma/enums.js';
import { PrismaAccountsRepository } from './prisma-accounts.repository.js';
import { PrismaSessionsRepository } from './prisma-sessions.repository.js';

describe('Auth repositories (integration)', () => {
  const prisma = testPrismaService();
  const accounts = new PrismaAccountsRepository(prisma);
  const sessions = new PrismaSessionsRepository(prisma);

  beforeAll(() => prisma.onModuleInit());
  afterAll(() => prisma.onModuleDestroy());
  beforeEach(() => resetDatabase(prisma));

  const newUser = (overrides = {}) =>
    accounts.createUserWithAccount({
      username: 'kasun',
      displayName: 'Kasun Perera',
      email: 'kasun@example.lk',
      provider: OAuthProvider.GOOGLE,
      providerAccountId: 'g-1',
      ...overrides,
    });

  describe('PrismaAccountsRepository', () => {
    it('creates a user with their linked account and finds them by account or id', async () => {
      const user = await newUser();
      expect(user).toEqual({
        id: expect.any(String),
        username: 'kasun',
        displayName: 'Kasun Perera',
        avatarUrl: null,
        hometownId: null,
        onboarded: false,
      });
      await expect(accounts.findUserByAccount(OAuthProvider.GOOGLE, 'g-1')).resolves.toEqual(user);
      await expect(accounts.findUserById(user.id)).resolves.toEqual(user);
    });

    it('returns null for unknown accounts and users', async () => {
      await newUser();
      await expect(accounts.findUserByAccount(OAuthProvider.FACEBOOK, 'g-1')).resolves.toBeNull();
      await expect(accounts.findUserById(randomUUID())).resolves.toBeNull();
    });

    it('reports taken usernames and enforces uniqueness', async () => {
      await newUser();
      await expect(accounts.usernameExists('kasun')).resolves.toBe(true);
      await expect(accounts.usernameExists('tharushi')).resolves.toBe(false);
      await expect(newUser({ providerAccountId: 'g-2' })).rejects.toThrow();
    });

    it('reports onboarded users', async () => {
      const user = await newUser();
      await prisma.user.update({ where: { id: user.id }, data: { onboardedAt: new Date(), hometownId: 'kandy' } });
      await expect(accounts.findUserById(user.id)).resolves.toMatchObject({ onboarded: true, hometownId: 'kandy' });
    });
  });

  describe('PrismaSessionsRepository', () => {
    const session = (userId: string, familyId: string, tokenHash: string) => ({
      userId,
      familyId,
      tokenHash,
      expiresAt: new Date(Date.now() + 86_400_000),
      userAgent: 'vitest',
    });

    it('creates and finds sessions by token hash', async () => {
      const user = await newUser();
      const family = randomUUID();
      const created = await sessions.create(session(user.id, family, 'hash-1'));
      await expect(sessions.findByTokenHash('hash-1')).resolves.toEqual(created);
      await expect(sessions.findByTokenHash('missing')).resolves.toBeNull();
    });

    it('rotates atomically: old revoked, new active in the same family', async () => {
      const user = await newUser();
      const family = randomUUID();
      const old = await sessions.create(session(user.id, family, 'hash-1'));
      const next = await sessions.rotate(old.id, session(user.id, family, 'hash-2'));
      expect((await sessions.findByTokenHash('hash-1'))?.revokedAt).toBeInstanceOf(Date);
      expect(next).toMatchObject({ familyId: family, revokedAt: null });
    });

    it('revokes one session or a whole family, without touching others', async () => {
      const user = await newUser();
      const family = randomUUID();
      const a = await sessions.create(session(user.id, family, 'a'));
      await sessions.create(session(user.id, family, 'b'));
      await sessions.create(session(user.id, randomUUID(), 'other'));

      await sessions.revoke(a.id);
      await sessions.revoke(a.id); // idempotent
      expect((await sessions.findByTokenHash('a'))?.revokedAt).toBeInstanceOf(Date);
      expect((await sessions.findByTokenHash('b'))?.revokedAt).toBeNull();

      await sessions.revokeFamily(family);
      expect((await sessions.findByTokenHash('b'))?.revokedAt).toBeInstanceOf(Date);
      expect((await sessions.findByTokenHash('other'))?.revokedAt).toBeNull();
    });

    it('deletes sessions when the user is deleted', async () => {
      const user = await newUser();
      await sessions.create(session(user.id, randomUUID(), 'x'));
      await prisma.user.delete({ where: { id: user.id } });
      await expect(sessions.findByTokenHash('x')).resolves.toBeNull();
    });
  });
});
