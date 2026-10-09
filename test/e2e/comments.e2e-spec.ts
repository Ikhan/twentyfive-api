import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../helpers/create-test-app.js';
import { createTestPrisma, resetDatabase } from '../helpers/test-db.js';
import { createUser, type TestUser } from '../helpers/users.js';

describe('Comments (e2e)', () => {
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

  const post = async (user: TestUser, body: string) =>
    (await http().post('/api/v1/posts').set('Authorization', user.auth).send({ body, districtId: 'kandy' }).expect(201))
      .body.data.id as string;
  const comment = (user: TestUser, postId: string, body: string) =>
    http().post(`/api/v1/posts/${postId}/comments`).set('Authorization', user.auth).send({ body });

  it('comments on a post, lists them in order and counts them', async () => {
    const postId = await post(kasun, 'Perahera tonight');
    const created = await comment(arun, postId, '  See you there  ').expect(201);
    expect(created.body.data).toMatchObject({ body: 'See you there', author: { username: 'arun' } });
    await comment(kasun, postId, 'Bring an umbrella').expect(201);

    const page = await http()
      .get(`/api/v1/posts/${postId}/comments?limit=1`)
      .set('Authorization', kasun.auth)
      .expect(200);
    expect(page.body.data.map((c: { body: string }) => c.body)).toEqual(['See you there']);
    const next = await http()
      .get(`/api/v1/posts/${postId}/comments?limit=1&cursor=${page.body.meta.nextCursor}`)
      .set('Authorization', kasun.auth)
      .expect(200);
    expect(next.body.data.map((c: { body: string }) => c.body)).toEqual(['Bring an umbrella']);

    const read = await http().get(`/api/v1/posts/${postId}`).set('Authorization', arun.auth).expect(200);
    expect(read.body.data.counts).toMatchObject({ comments: 2 });
  });

  it('likes and unlikes comments, on posts you can see', async () => {
    const postId = await post(kasun, 'Perahera tonight');
    const id = (await comment(arun, postId, 'See you there').expect(201)).body.data.id as string;
    const liked = await http().put(`/api/v1/comments/${id}/like`).set('Authorization', kasun.auth).expect(200);
    expect(liked.body.data).toMatchObject({ id, likeCount: 1, viewer: { liked: true } });
    const list = await http().get(`/api/v1/posts/${postId}/comments`).set('Authorization', arun.auth).expect(200);
    expect(list.body.data[0]).toMatchObject({ likeCount: 1, viewer: { liked: false } });
    const unliked = await http().delete(`/api/v1/comments/${id}/like`).set('Authorization', kasun.auth).expect(200);
    expect(unliked.body.data).toMatchObject({ likeCount: 0, viewer: { liked: false } });

    const secret = await post(sachini, 'Only followers');
    const hidden = (await comment(sachini, secret, 'Shh').expect(201)).body.data.id as string;
    await http().put(`/api/v1/comments/${hidden}/like`).set('Authorization', arun.auth).expect(404);
    await http().put(`/api/v1/comments/${id}/like`).expect(401);
  });

  it('validates comments', async () => {
    const postId = await post(kasun, 'hi');
    await comment(arun, postId, '   ').expect(400);
    await comment(arun, postId, 'x'.repeat(501)).expect(400);
    await http().post(`/api/v1/posts/${postId}/comments`).set('Authorization', arun.auth).send({}).expect(400);
    await comment(arun, 'not-a-uuid', 'hi').expect(400);
  });

  it('hides comments on posts you cannot see and needs sign-in', async () => {
    const postId = await post(sachini, 'private');
    await comment(arun, postId, 'hi').expect(404);
    await http().get(`/api/v1/posts/${postId}/comments`).set('Authorization', arun.auth).expect(404);
    await http().get(`/api/v1/posts/${postId}/comments`).expect(401);
  });

  it('lets the comment’s author or the post’s author delete it', async () => {
    const postId = await post(kasun, 'hi');
    const a = (await comment(arun, postId, 'one').expect(201)).body.data.id;
    const b = (await comment(arun, postId, 'two').expect(201)).body.data.id;
    await http().delete(`/api/v1/comments/${a}`).set('Authorization', sachini.auth).expect(403);
    await http().delete(`/api/v1/comments/${a}`).set('Authorization', arun.auth).expect(200);
    await http().delete(`/api/v1/comments/${b}`).set('Authorization', kasun.auth).expect(200);
    await http().delete(`/api/v1/comments/${b}`).set('Authorization', kasun.auth).expect(404);
  });

  it('replies to comments one level deep, and tells whoever was answered', async () => {
    const postId = await post(kasun, 'Perahera tonight');
    const top = (await comment(arun, postId, 'Who is going?').expect(201)).body.data;
    const reply = (post: string, user: TestUser, body: string, parentId: string) =>
      http().post(`/api/v1/posts/${post}/comments`).set('Authorization', user.auth).send({ body, parentId });
    const first = (await reply(postId, kasun, 'Me!', top.id).expect(201)).body.data;
    expect(first).toMatchObject({ parentId: top.id, replyCount: 0 });
    // Answering the reply stays in the same thread.
    const second = (await reply(postId, arun, '@kasun great', first.id).expect(201)).body.data;
    expect(second.parentId).toBe(top.id);

    const list = await http().get(`/api/v1/posts/${postId}/comments`).set('Authorization', kasun.auth).expect(200);
    expect(list.body.data.map((c: { body: string; replyCount: number }) => [c.body, c.replyCount])).toEqual([
      ['Who is going?', 2],
    ]);
    const replies = await http().get(`/api/v1/comments/${top.id}/replies`).set('Authorization', kasun.auth).expect(200);
    expect(replies.body.data.map((c: { body: string }) => c.body)).toEqual(['Me!', '@kasun great']);
    const stats = await http().get(`/api/v1/posts/${postId}`).set('Authorization', kasun.auth).expect(200);
    expect(stats.body.data.counts.comments).toBe(3);

    // Arun hears Kasun replied; Kasun (post author, replied to) gets one REPLY, not a comment too.
    const inbox = (user: TestUser) =>
      http()
        .get('/api/v1/notifications')
        .set('Authorization', user.auth)
        .expect(200)
        .then((r) => r.body.data);
    await vi.waitFor(async () => {
      expect((await inbox(arun)).map((n: { type: string }) => n.type)).toEqual(['REPLY']);
      expect((await inbox(kasun)).map((n: { type: string }) => n.type)).toEqual(['REPLY', 'COMMENT']);
    });

    // Unknown or other-post parents are 404s; replies go with their comment.
    const other = await post(kasun, 'Other');
    await reply(other, arun, 'hi', top.id).expect(404);
    await http().delete(`/api/v1/comments/${top.id}`).set('Authorization', kasun.auth).expect(200);
    await http().get(`/api/v1/comments/${top.id}/replies`).set('Authorization', kasun.auth).expect(404);
    expect(await prisma.comment.count({ where: { postId } })).toBe(0);
  });
});
