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
});
