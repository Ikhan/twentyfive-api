import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../helpers/create-test-app.js';
import { createTestPrisma, resetDatabase } from '../helpers/test-db.js';
import { createUser, type TestUser } from '../helpers/users.js';

interface N {
  id: string;
  type: string;
  actor: { username: string };
  excerpt: string | null;
  read: boolean;
}

describe('Notifications (e2e)', () => {
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

  const inbox = async (user: TestUser): Promise<N[]> =>
    (await http().get('/api/v1/notifications').set('Authorization', user.auth).expect(200)).body.data;
  /** Notifications are written by event listeners after the response, so wait for them. */
  const eventually = (user: TestUser, check: (n: N[]) => void) =>
    vi.waitFor(async () => check(await inbox(user)), { timeout: 2000, interval: 25 });

  it('notifies about follows, comments and reposts, but not your own actions', async () => {
    await http().put('/api/v1/users/kasun/follow').set('Authorization', arun.auth).expect(200);
    const postId = (
      await http().post('/api/v1/posts').set('Authorization', kasun.auth).send({ body: 'hi', districtId: 'kandy' })
    ).body.data.id;
    await http().post(`/api/v1/posts/${postId}/comments`).set('Authorization', arun.auth).send({ body: 'Nice one' });
    await http().post(`/api/v1/posts/${postId}/comments`).set('Authorization', kasun.auth).send({ body: 'Thanks' });
    await http().put(`/api/v1/posts/${postId}/repost`).set('Authorization', arun.auth).expect(200);

    await eventually(kasun, (n) =>
      expect(n.map((x) => [x.type, x.actor.username, x.excerpt])).toEqual([
        ['REPOST', 'arun', null],
        ['COMMENT', 'arun', 'Nice one'],
        ['FOLLOW', 'arun', null],
      ]),
    );
    expect(await inbox(arun)).toEqual([]);
  });

  it('groups new posts in a district for followers who turned its bell on', async () => {
    const districtApi = (method: 'put' | 'delete', path: string) =>
      http()[method](`/api/v1/districts/kandy/${path}`).set('Authorization', kasun.auth);
    await districtApi('put', 'notifications').expect(409); // follow first
    await districtApi('put', 'follow').expect(200);
    const on = await districtApi('put', 'notifications').expect(200);
    expect(on.body.data).toMatchObject({ followedByMe: true, notifying: true });

    const post = (body: string, extra: object = {}) =>
      http()
        .post('/api/v1/posts')
        .set('Authorization', arun.auth)
        .send({ body, districtId: 'kandy', ...extra });
    await post('Perahera tonight');
    await post('Friends only', { audience: 'FOLLOWERS' });
    await post('Traffic near the lake');
    await eventually(kasun, (n) =>
      expect(n).toMatchObject([
        { type: 'DISTRICT_POST', actor: { username: 'arun' }, excerpt: 'Traffic near the lake', postCount: 2 },
      ]),
    );
    const [group] = await inbox(kasun);
    expect(group).toMatchObject({ district: { id: 'kandy', name: 'Kandy' } });

    await districtApi('delete', 'notifications').expect(200);
    await post('Quiet now');
    await new Promise((r) => setTimeout(r, 200));
    expect((await inbox(kasun)).map((n) => n.excerpt)).toEqual(['Traffic near the lake']);
  });

  it('handles follow requests end to end', async () => {
    await http().put('/api/v1/users/sachini/follow').set('Authorization', arun.auth).expect(200);
    await eventually(sachini, (n) => expect(n.map((x) => x.type)).toEqual(['FOLLOW_REQUEST']));

    await http().post('/api/v1/follow-requests/arun/accept').set('Authorization', sachini.auth).expect(200);
    await eventually(arun, (n) =>
      expect(n.map((x) => [x.type, x.actor.username])).toEqual([['FOLLOW_ACCEPTED', 'sachini']]),
    );
    await eventually(sachini, (n) => expect(n).toEqual([]));
  });

  it('counts unread and marks them read', async () => {
    await http().put('/api/v1/users/kasun/follow').set('Authorization', arun.auth).expect(200);
    await http().put('/api/v1/users/kasun/follow').set('Authorization', sachini.auth).expect(200);
    await eventually(kasun, (n) => expect(n).toHaveLength(2));
    const count = () => http().get('/api/v1/notifications/unread-count').set('Authorization', kasun.auth).expect(200);
    expect((await count()).body.data).toEqual({ count: 2 });

    const [first] = await inbox(kasun);
    await http().post(`/api/v1/notifications/${first!.id}/read`).set('Authorization', kasun.auth).expect(200);
    await http().post(`/api/v1/notifications/${first!.id}/read`).set('Authorization', arun.auth).expect(404);
    expect((await count()).body.data).toEqual({ count: 1 });
    await http().post('/api/v1/notifications/read-all').set('Authorization', kasun.auth).expect(200);
    expect((await count()).body.data).toEqual({ count: 0 });
    expect((await inbox(kasun)).every((n) => n.read)).toBe(true);
  });

  it('needs sign-in', async () => {
    await http().get('/api/v1/notifications').expect(401);
  });

  it('notifies people mentioned in posts and comments, if they can see them, and links real handles', async () => {
    const post = await http()
      .post('/api/v1/posts')
      .set('Authorization', kasun.auth)
      .send({ body: 'Perahera tonight @arun @sachini @ghost' })
      .expect(201);
    expect(post.body.data.mentions).toEqual(['arun', 'sachini']);
    await eventually(arun, (n) =>
      expect(n.map((x) => [x.type, x.actor.username, x.excerpt])).toEqual([
        ['MENTION', 'kasun', 'Perahera tonight @arun @sachini @ghost'],
      ]),
    );
    await eventually(sachini, (n) => expect(n.map((x) => x.type)).toEqual(['MENTION']));

    // In a comment: Kasun gets the comment, not a mention too; Arun is already mentioned in the post, but again here.
    const comment = await http()
      .post(`/api/v1/posts/${post.body.data.id}/comments`)
      .set('Authorization', sachini.auth)
      .send({ body: '@kasun @arun count me in' })
      .expect(201);
    expect(comment.body.data.mentions).toEqual(['kasun', 'arun']);
    await eventually(arun, (n) => expect(n.map((x) => x.type)).toEqual(['MENTION', 'MENTION']));
    await eventually(kasun, (n) => expect(n.map((x) => x.type)).toEqual(['COMMENT']));

    // Followers-only: someone who isn't a follower isn't told.
    await http()
      .post('/api/v1/posts')
      .set('Authorization', sachini.auth)
      .send({ body: 'Just us @kasun', audience: 'FOLLOWERS' })
      .expect(201);
    const feed = await http().get('/api/v1/feed').set('Authorization', arun.auth).expect(200);
    expect(feed.body.data[0].mentions).toEqual(['arun', 'sachini']);
    await new Promise((r) => setTimeout(r, 200));
    expect((await inbox(kasun)).map((x) => x.type)).toEqual(['COMMENT']);
  });
});
