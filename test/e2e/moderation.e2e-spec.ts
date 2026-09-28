import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../helpers/create-test-app.js';
import { createTestPrisma, resetDatabase } from '../helpers/test-db.js';
import { createUser, type TestUser } from '../helpers/users.js';

describe('Moderation (e2e)', () => {
  let app: INestApplication;
  const prisma = createTestPrisma();
  const http = () => request(app.getHttpServer());
  let kasun: TestUser;
  let arun: TestUser;

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
    arun = await createUser(app, prisma, { username: 'arun' });
  });

  const post = async (user: TestUser) =>
    (await http().post('/api/v1/posts').set('Authorization', user.auth).send({ body: 'hi', districtId: 'kandy' })).body
      .data.id as string;

  it('blocking cuts follows, hides posts both ways and stops new follows', async () => {
    await http().put('/api/v1/users/kasun/follow').set('Authorization', arun.auth).expect(200);
    await http().put('/api/v1/users/arun/follow').set('Authorization', kasun.auth).expect(200);
    const postId = await post(arun);

    const res = await http().put('/api/v1/users/arun/block').set('Authorization', kasun.auth).expect(200);
    expect(res.body.data).toEqual({ blocked: true });

    await vi.waitFor(async () => expect(await prisma.follow.count()).toBe(0), { timeout: 2000, interval: 25 });
    await http().get(`/api/v1/posts/${postId}`).set('Authorization', kasun.auth).expect(404);
    await http().put(`/api/v1/posts/${postId}/like`).set('Authorization', kasun.auth).expect(404);
    const refused = await http().put('/api/v1/users/kasun/follow').set('Authorization', arun.auth).expect(403);
    expect(refused.body.error.message).toBe('You can’t follow @kasun.');

    const list = await http().get('/api/v1/users/me/blocks').set('Authorization', kasun.auth).expect(200);
    expect(list.body.data.map((u: { username: string }) => u.username)).toEqual(['arun']);

    await http().delete('/api/v1/users/arun/block').set('Authorization', kasun.auth).expect(200);
    await http().get(`/api/v1/posts/${postId}`).set('Authorization', kasun.auth).expect(200);
  });

  it('validates blocks', async () => {
    await http().put('/api/v1/users/kasun/block').set('Authorization', kasun.auth).expect(400);
    await http().put('/api/v1/users/ghost/block').set('Authorization', kasun.auth).expect(404);
    await http().get('/api/v1/users/me/blocks').expect(401);
  });

  it('reports posts, comments and people', async () => {
    const postId = await post(arun);
    const commentId = (
      await http().post(`/api/v1/posts/${postId}/comments`).set('Authorization', arun.auth).send({ body: 'spam' })
    ).body.data.id;
    const send = (body: object) => http().post('/api/v1/reports').set('Authorization', kasun.auth).send(body);

    await send({ targetType: 'POST', targetId: postId, reason: 'SPAM', details: 'ad' }).expect(201);
    await send({ targetType: 'POST', targetId: postId, reason: 'SPAM' }).expect(201);
    await send({ targetType: 'COMMENT', targetId: commentId, reason: 'HARASSMENT' }).expect(201);
    await send({ targetType: 'USER', targetId: arun.id, reason: 'OTHER' }).expect(201);
    expect(await prisma.report.count()).toBe(3);

    await send({ targetType: 'USER', targetId: kasun.id, reason: 'OTHER' }).expect(400);
    await send({ targetType: 'POST', targetId: crypto.randomUUID(), reason: 'SPAM' }).expect(404);
    await send({ targetType: 'PLANET', targetId: postId, reason: 'SPAM' }).expect(400);
    await send({ targetType: 'POST', targetId: postId, reason: 'BORED' }).expect(400);
    await send({ targetType: 'POST', targetId: postId, reason: 'SPAM', details: 'x'.repeat(501) }).expect(400);
  });
});
