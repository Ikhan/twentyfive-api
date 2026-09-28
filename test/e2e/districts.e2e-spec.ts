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
