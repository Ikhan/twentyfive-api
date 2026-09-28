import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../helpers/create-test-app.js';
import { createTestPrisma, resetDatabase } from '../helpers/test-db.js';
import { createUser, type TestUser } from '../helpers/users.js';

describe('Reactions (e2e)', () => {
  let app: INestApplication;
  const prisma = createTestPrisma();
  const http = () => request(app.getHttpServer());
  let kasun: TestUser;
  let sachini: TestUser;
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
    sachini = await createUser(app, prisma, { username: 'sachini', isPrivate: true });
    arun = await createUser(app, prisma, { username: 'arun' });
  });

  const post = async (user: TestUser, audience: 'EVERYONE' | 'FOLLOWERS' = 'EVERYONE') =>
    (
      await http()
        .post('/api/v1/posts')
        .set('Authorization', user.auth)
        .send({ body: 'hi', districtId: 'kandy', audience })
        .expect(201)
    ).body.data.id as string;
  const react = (method: 'put' | 'delete', user: TestUser, postId: string, kind: 'like' | 'repost') =>
    http()[method](`/api/v1/posts/${postId}/${kind}`).set('Authorization', user.auth);

  it('likes and reposts, with counts and flags for each viewer', async () => {
    const postId = await post(kasun);
    const liked = await react('put', arun, postId, 'like').expect(200);
    expect(liked.body.data).toMatchObject({
      counts: { comments: 0, likes: 1, reposts: 0 },
      viewer: { liked: true, reposted: false },
    });
    await react('put', arun, postId, 'like').expect(200);
    const reposted = await react('put', arun, postId, 'repost').expect(200);
    expect(reposted.body.data).toMatchObject({
      counts: { likes: 1, reposts: 1 },
      viewer: { liked: true, reposted: true },
    });

    const feed = await http().get('/api/v1/feed').set('Authorization', kasun.auth).expect(200);
    expect(feed.body.data[0]).toMatchObject({
      counts: { likes: 1, reposts: 1 },
      viewer: { liked: false, reposted: false },
    });

    const undone = await react('delete', arun, postId, 'like').expect(200);
    expect(undone.body.data).toMatchObject({ counts: { likes: 0 }, viewer: { liked: false } });
    await react('delete', arun, postId, 'repost').expect(200);
  });

  it('only reposts public posts', async () => {
    const fansOnly = await post(kasun, 'FOLLOWERS');
    const res = await react('put', kasun, fansOnly, 'repost').expect(403);
    expect(res.body.error.message).toBe('Only public posts can be reposted.');
    await react('put', kasun, fansOnly, 'like').expect(200);
  });

  it('hides posts you cannot see, validates ids and needs sign-in', async () => {
    const privatePost = await post(sachini);
    await react('put', arun, privatePost, 'like').expect(404);
    await react('put', arun, 'nope', 'like').expect(400);
    await http().put(`/api/v1/posts/${privatePost}/like`).expect(401);
  });
});
