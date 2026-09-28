import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../helpers/create-test-app.js';
import { createTestPrisma, resetDatabase } from '../helpers/test-db.js';
import { createUser, type TestUser } from '../helpers/users.js';

describe('Follows (e2e)', () => {
  let app: INestApplication;
  const prisma = createTestPrisma();
  const http = () => request(app.getHttpServer());
  let kasun: TestUser;
  let tharushi: TestUser;
  let sachini: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    kasun = await createUser(app, prisma, { username: 'kasun' });
    tharushi = await createUser(app, prisma, { username: 'tharushi' });
    sachini = await createUser(app, prisma, { username: 'sachini', isPrivate: true });
  });

  it('follows a public account and shows up in their followers', async () => {
    const res = await http().put('/api/v1/users/tharushi/follow').set('Authorization', kasun.auth).expect(200);
    expect(res.body.data).toEqual({ followers: 1, following: 0, relationship: 'following', followsYou: false });
    const followers = await http()
      .get('/api/v1/users/tharushi/followers')
      .set('Authorization', sachini.auth)
      .expect(200);
    expect(followers.body.data.map((u: { username: string }) => u.username)).toEqual(['kasun']);
    const theirView = await http()
      .get('/api/v1/users/kasun/follow-stats')
      .set('Authorization', tharushi.auth)
      .expect(200);
    expect(theirView.body.data).toMatchObject({ relationship: 'none', followsYou: true, following: 1 });
  });

  it('private accounts: request → accept, with connections hidden until approved', async () => {
    const requested = await http().put('/api/v1/users/sachini/follow').set('Authorization', kasun.auth).expect(200);
    expect(requested.body.data.relationship).toBe('requested');
    await http().get('/api/v1/users/sachini/followers').set('Authorization', kasun.auth).expect(403);

    const inbox = await http().get('/api/v1/follow-requests').set('Authorization', sachini.auth).expect(200);
    expect(inbox.body.data.map((u: { username: string }) => u.username)).toEqual(['kasun']);
    await http().post('/api/v1/follow-requests/kasun/accept').set('Authorization', sachini.auth).expect(200);
    await http().post('/api/v1/follow-requests/kasun/accept').set('Authorization', sachini.auth).expect(404);

    const followers = await http().get('/api/v1/users/sachini/followers').set('Authorization', kasun.auth).expect(200);
    expect(followers.body.data.map((u: { username: string }) => u.username)).toEqual(['kasun']);
  });

  it('declines requests and cancels them', async () => {
    await http().put('/api/v1/users/sachini/follow').set('Authorization', kasun.auth).expect(200);
    await http().post('/api/v1/follow-requests/kasun/decline').set('Authorization', sachini.auth).expect(200);
    const stats = await http().get('/api/v1/users/sachini/follow-stats').set('Authorization', kasun.auth).expect(200);
    expect(stats.body.data.relationship).toBe('none');

    await http().put('/api/v1/users/sachini/follow').set('Authorization', tharushi.auth).expect(200);
    const cancelled = await http()
      .delete('/api/v1/users/sachini/follow')
      .set('Authorization', tharushi.auth)
      .expect(200);
    expect(cancelled.body.data.relationship).toBe('none');
  });

  it('going public approves every pending request', async () => {
    await http().put('/api/v1/users/sachini/follow').set('Authorization', kasun.auth).expect(200);
    await http().put('/api/v1/users/sachini/follow').set('Authorization', tharushi.auth).expect(200);
    await http().patch('/api/v1/users/me').set('Authorization', sachini.auth).send({ isPrivate: false }).expect(200);
    const stats = await http().get('/api/v1/users/sachini/follow-stats').set('Authorization', kasun.auth).expect(200);
    expect(stats.body.data).toMatchObject({ followers: 2, relationship: 'following' });
    const inbox = await http().get('/api/v1/follow-requests').set('Authorization', sachini.auth).expect(200);
    expect(inbox.body.data).toEqual([]);
  });

  it('rejects self-follows and unknown users, and requires sign-in', async () => {
    await http().put('/api/v1/users/kasun/follow').set('Authorization', kasun.auth).expect(400);
    await http().put('/api/v1/users/nobody/follow').set('Authorization', kasun.auth).expect(404);
    await http().put('/api/v1/users/tharushi/follow').expect(401);
  });
});
