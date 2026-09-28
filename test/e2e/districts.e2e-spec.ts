import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../helpers/create-test-app.js';
import { createTestPrisma, resetDatabase } from '../helpers/test-db.js';
import { createUser, type TestUser } from '../helpers/users.js';

describe('Districts (e2e)', () => {
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
    kasun = await createUser(app, prisma, { username: 'kasun', hometownId: 'kandy' });
  });

  it('lists all 25 districts A–Z without signing in, and filters by province', async () => {
    const all = await http().get('/api/v1/districts').expect(200);
    expect(all.body.data).toHaveLength(25);
    expect(all.body.data[0]).toMatchObject({
      id: 'ampara',
      name: 'Ampara',
      province: { id: 'EASTERN', name: 'Eastern' },
    });
    const uva = await http().get('/api/v1/districts?province=UVA').expect(200);
    expect(uva.body.data.map((d: { id: string }) => d.id)).toEqual(['badulla', 'monaragala']);
    await http().get('/api/v1/districts?province=MARS').expect(400);
  });

  it('includes follower counts, and your follows when signed in', async () => {
    await http().put('/api/v1/districts/kandy/follow').set('Authorization', kasun.auth).expect(200);
    const anon = await http().get('/api/v1/districts').expect(200);
    expect(anon.body.data.find((d: { id: string }) => d.id === 'kandy')).toMatchObject({
      followerCount: 1,
      followedByMe: false,
    });
    expect(anon.body.data.find((d: { id: string }) => d.id === 'galle')).toMatchObject({
      followerCount: 0,
      followedByMe: false,
    });
    const mine = await http().get('/api/v1/districts').set('Authorization', kasun.auth).expect(200);
    expect(mine.body.data.find((d: { id: string }) => d.id === 'kandy')).toMatchObject({
      followerCount: 1,
      followedByMe: true,
    });
  });

  // The only trending test here: the ranking is cached for the life of the app.
  it('ranks trending cities without signing in: active today first, then most followed', async () => {
    await http()
      .post('/api/v1/posts')
      .set('Authorization', kasun.auth)
      .send({ body: 'Galle today', districtId: 'galle' })
      .expect(201);
    await http().put('/api/v1/districts/jaffna/follow').set('Authorization', kasun.auth).expect(200);
    const res = await http().get('/api/v1/districts/trending?limit=2').expect(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({ id: 'galle', name: 'Galle', postCount: 1, window: 'day', followerCount: 0 }),
      // A new follower counts as activity too (2), just under the bar alone, so Jaffna is here for its follower.
      expect.objectContaining({ id: 'jaffna', postCount: 0, window: null, followerCount: 1 }),
    ]);
    expect((await http().get('/api/v1/districts/trending').expect(200)).body.data).toHaveLength(5);
    await http().get('/api/v1/districts/trending?limit=0').expect(400);
    await http().get('/api/v1/districts/trending?limit=26').expect(400);
  });

  it('shows detail publicly, with followedByMe when signed in', async () => {
    const anon = await http().get('/api/v1/districts/kandy').expect(200);
    expect(anon.body.data).toMatchObject({
      name: 'Kandy',
      followerCount: 0,
      followedByMe: false,
      famousFor: expect.any(Array),
    });
    await http().put('/api/v1/districts/kandy/follow').set('Authorization', kasun.auth).expect(200);
    const signedIn = await http().get('/api/v1/districts/kandy').set('Authorization', kasun.auth).expect(200);
    expect(signedIn.body.data).toMatchObject({ followerCount: 1, followedByMe: true });
    await http().get('/api/v1/districts/atlantis').expect(404);
  });

  it('follows and unfollows (sign-in required)', async () => {
    await http().put('/api/v1/districts/kandy/follow').expect(401);
    const followed = await http().put('/api/v1/districts/kandy/follow').set('Authorization', kasun.auth).expect(200);
    expect(followed.body.data).toEqual({ followerCount: 1, followedByMe: true });
    await http().put('/api/v1/districts/kandy/follow').set('Authorization', kasun.auth).expect(200);
    const unfollowed = await http()
      .delete('/api/v1/districts/kandy/follow')
      .set('Authorization', kasun.auth)
      .expect(200);
    expect(unfollowed.body.data).toEqual({ followerCount: 0, followedByMe: false });
  });

  it('pages through the people from a district', async () => {
    await createUser(app, prisma, { username: 'arun', hometownId: 'kandy' });
    await createUser(app, prisma, { username: 'bala', hometownId: 'kandy' });
    const first = await http().get('/api/v1/districts/kandy/residents?limit=2').expect(200);
    expect(first.body.data.map((u: { username: string }) => u.username)).toEqual(['arun', 'bala']);
    expect(first.body.meta.nextCursor).toEqual(expect.any(String));
    const second = await http()
      .get(`/api/v1/districts/kandy/residents?limit=2&cursor=${first.body.meta.nextCursor}`)
      .expect(200);
    expect(second.body.data.map((u: { username: string }) => u.username)).toEqual(['kasun']);
    expect(second.body.meta).toEqual({ nextCursor: null, limit: 2 });
    await http().get('/api/v1/districts/kandy/residents?limit=99').expect(400);
  });
});
