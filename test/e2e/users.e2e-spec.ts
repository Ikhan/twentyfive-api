import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../helpers/create-test-app.js';
import { createTestPrisma, resetDatabase } from '../helpers/test-db.js';
import { createUser, type TestUser } from '../helpers/users.js';

describe('Users (e2e)', () => {
  let app: INestApplication;
  const prisma = createTestPrisma();
  const http = () => request(app.getHttpServer());
  let kasun: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    kasun = await createUser(app, prisma, { username: 'kasunperera', displayName: 'Kasun Perera', onboarded: false });
    await createUser(app, prisma, { username: 'tharushi', displayName: 'Tharushi Fernando', hometownId: 'galle' });
  });

  it('requires a session', async () => {
    await http().get('/api/v1/users/me').expect(401);
  });

  it('onboards a new user end to end', async () => {
    const check = await http()
      .get('/api/v1/users/username-availability?username=Kasun')
      .set('Authorization', kasun.auth)
      .expect(200);
    expect(check.body.data).toEqual({ available: true });

    const res = await http()
      .post('/api/v1/users/me/onboarding')
      .set('Authorization', kasun.auth)
      .send({
        displayName: ' Kasun Perera ',
        username: 'Kasun',
        hometownId: 'kandy',
        bio: 'Kandy boy',
        isPrivate: false,
      })
      .expect(201);
    expect(res.body.data).toMatchObject({
      username: 'kasun',
      displayName: 'Kasun Perera',
      hometown: { id: 'kandy', name: 'Kandy' },
      onboarded: true,
    });

    const me = await http().get('/api/v1/users/me').set('Authorization', kasun.auth).expect(200);
    expect(me.body.data).toMatchObject({ username: 'kasun', bio: 'Kandy boy', onboarded: true });
  });

  it('explains why a username is unavailable', async () => {
    const reasons = await Promise.all(
      ['tharushi', 'admin', 'no'].map(async (username) => {
        const res = await http()
          .get(`/api/v1/users/username-availability?username=${username}`)
          .set('Authorization', kasun.auth)
          .expect(200);
        return res.body.data.reason;
      }),
    );
    expect(reasons).toEqual(['taken', 'reserved', 'invalid']);
  });

  it('validates onboarding and profile edits', async () => {
    const missing = await http()
      .post('/api/v1/users/me/onboarding')
      .set('Authorization', kasun.auth)
      .send({})
      .expect(400);
    expect(missing.body.error.code).toBe('VALIDATION_FAILED');

    const taken = await http()
      .patch('/api/v1/users/me')
      .set('Authorization', kasun.auth)
      .send({ username: 'tharushi' })
      .expect(409);
    expect(taken.body.error).toMatchObject({ code: 'CONFLICT', details: { field: 'username' } });

    const district = await http()
      .patch('/api/v1/users/me')
      .set('Authorization', kasun.auth)
      .send({ hometownId: 'atlantis' })
      .expect(400);
    expect(district.body.error.details).toEqual({ field: 'hometownId' });

    await http().patch('/api/v1/users/me').set('Authorization', kasun.auth).send({ email: 'x@y.lk' }).expect(400);
  });

  it('edits settings', async () => {
    const res = await http()
      .patch('/api/v1/users/me')
      .set('Authorization', kasun.auth)
      .send({ bio: 'Perahera every year', isPrivate: true })
      .expect(200);
    expect(res.body.data).toMatchObject({ bio: 'Perahera every year', isPrivate: true });
  });

  it('shows public profiles without private fields, and 404s for unknown users', async () => {
    const res = await http().get('/api/v1/users/tharushi').set('Authorization', kasun.auth).expect(200);
    expect(res.body.data).toMatchObject({
      username: 'tharushi',
      displayName: 'Tharushi Fernando',
      hometown: { id: 'galle', name: 'Galle' },
    });
    expect(res.body.data).not.toHaveProperty('email');
    expect(res.body.data).not.toHaveProperty('onboarded');
    await http().get('/api/v1/users/nobody').set('Authorization', kasun.auth).expect(404);
  });

  it('suggests people to @mention', async () => {
    const res = await http().get('/api/v1/users/search?q=@Tha').set('Authorization', kasun.auth).expect(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({ username: 'tharushi', displayName: 'Tharushi Fernando' }),
    ]);
    const byName = await http().get('/api/v1/users/search?q=fern&limit=3').set('Authorization', kasun.auth).expect(200);
    expect(byName.body.data.map((u: { username: string }) => u.username)).toEqual(['tharushi']);
    // One or two letters: only your connections, until Tharushi follows you.
    const short = () => http().get('/api/v1/users/search?q=t').set('Authorization', kasun.auth).expect(200);
    expect((await short()).body.data).toEqual([]);
    const tharushi = await prisma.user.findUniqueOrThrow({ where: { username: 'tharushi' } });
    await prisma.follow.create({ data: { followerId: tharushi.id, followeeId: kasun.id, status: 'ACCEPTED' } });
    expect((await short()).body.data.map((u: { username: string }) => u.username)).toEqual(['tharushi']);
    await http().get('/api/v1/users/search?q=a&limit=21').set('Authorization', kasun.auth).expect(400);
    await http().get('/api/v1/users/search?q=a').expect(401);
  });
});
