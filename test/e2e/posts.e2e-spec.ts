import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { OBJECT_STORAGE } from '../../src/modules/media/storage/object-storage.js';
import { FakeObjectStorage, JPEG } from '../fakes/media-fakes.js';
import { createTestApp } from '../helpers/create-test-app.js';
import { createTestPrisma, resetDatabase } from '../helpers/test-db.js';
import { createUser, type TestUser } from '../helpers/users.js';

describe('Posts (e2e)', () => {
  let app: INestApplication;
  const storage = new FakeObjectStorage();
  const prisma = createTestPrisma();
  const http = () => request(app.getHttpServer());
  let kasun: TestUser;
  let sachini: TestUser;
  let arun: TestUser;

  beforeAll(async () => {
    app = await createTestApp({ overrides: [{ token: OBJECT_STORAGE, value: storage }] });
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    kasun = await createUser(app, prisma, { username: 'kasun', hometownId: 'kandy' });
    sachini = await createUser(app, prisma, { username: 'sachini', isPrivate: true });
    arun = await createUser(app, prisma, { username: 'arun' });
  });

  const create = (user: TestUser, body: object) =>
    http().post('/api/v1/posts').set('Authorization', user.auth).send(body);
  const bodies = (res: request.Response) => res.body.data.map((p: { body: string }) => p.body);

  async function photo(user: TestUser): Promise<string> {
    const res = await http()
      .post('/api/v1/media/uploads')
      .set('Authorization', user.auth)
      .send({ purpose: 'POST_PHOTO', contentType: 'image/jpeg', sizeBytes: 500 });
    storage.put(res.body.data.upload.fields.key, JPEG, 500);
    await http().post(`/api/v1/media/${res.body.data.mediaId}/complete`).set('Authorization', user.auth).expect(200);
    return res.body.data.mediaId;
  }

  it('creates a post with a photo and reads it back', async () => {
    const mediaId = await photo(kasun);
    const created = await create(kasun, {
      body: 'Blue train over Nine Arch',
      districtId: 'badulla',
      mediaIds: [mediaId],
    }).expect(201);
    expect(created.body.data).toMatchObject({
      body: 'Blue train over Nine Arch',
      audience: 'EVERYONE',
      author: { username: 'kasun' },
      district: { id: 'badulla', name: 'Badulla' },
      photos: [{ id: expect.any(String), url: expect.stringContaining(mediaId) }],
    });
    const read = await http().get(`/api/v1/posts/${created.body.data.id}`).set('Authorization', arun.auth).expect(200);
    expect(read.body.data.id).toBe(created.body.data.id);
    // A photo can only be used once.
    const reused = await create(kasun, { districtId: 'badulla', mediaIds: [mediaId] }).expect(400);
    expect(reused.body.error.details).toEqual({ field: 'mediaIds' });
  });

  it('posts to all districts when no district is given: in feeds, on no district page', async () => {
    const created = await create(kasun, { body: 'Power cut again tonight?' }).expect(201);
    expect(created.body.data.district).toBeNull();
    const feed = await http().get('/api/v1/feed').set('Authorization', arun.auth).expect(200);
    expect(bodies(feed)).toContain('Power cut again tonight?');
    const kandy = await http().get('/api/v1/districts/kandy/posts').set('Authorization', arun.auth).expect(200);
    expect(bodies(kandy)).not.toContain('Power cut again tonight?');
  });

  it('validates posts', async () => {
    const empty = await create(kasun, { body: '  ', districtId: 'kandy' }).expect(400);
    expect(empty.body.error.message).toBe('Write something or add a photo.');
    await create(kasun, { body: 'hi', districtId: 'atlantis' }).expect(400);
    await create(kasun, { body: 'hi', districtId: 'kandy', audience: 'FRIENDS' }).expect(400);
    await create(kasun, { body: 'hi', districtId: 'kandy', mediaIds: ['nope'] }).expect(400);
    await create(kasun, { body: 'x'.repeat(1001), districtId: 'kandy' }).expect(400);
    await http().post('/api/v1/posts').send({ body: 'hi', districtId: 'kandy' }).expect(401);
  });

  it('serves the For you and Following feeds with paging', async () => {
    await create(kasun, { body: 'one', districtId: 'kandy' }).expect(201);
    await create(kasun, { body: 'two', districtId: 'kandy' }).expect(201);
    await create(arun, { body: 'arun', districtId: 'galle' }).expect(201);

    const page1 = await http().get('/api/v1/feed?limit=2').set('Authorization', arun.auth).expect(200);
    expect(bodies(page1)).toEqual(['arun', 'two']);
    const page2 = await http()
      .get(`/api/v1/feed?limit=2&cursor=${page1.body.meta.nextCursor}`)
      .set('Authorization', arun.auth)
      .expect(200);
    expect(bodies(page2)).toEqual(['one']);

    expect(bodies(await http().get('/api/v1/feed?tab=following').set('Authorization', arun.auth).expect(200))).toEqual([
      'arun',
    ]);
    await http().put('/api/v1/users/kasun/follow').set('Authorization', arun.auth).expect(200);
    expect(bodies(await http().get('/api/v1/feed?tab=following').set('Authorization', arun.auth).expect(200))).toEqual([
      'arun',
      'two',
      'one',
    ]);
    await http().get('/api/v1/feed?tab=trending').set('Authorization', arun.auth).expect(400);
  });

  it('keeps followers-only and private posts from non-followers, everywhere', async () => {
    const friends = await create(kasun, { body: 'friends only', districtId: 'kandy', audience: 'FOLLOWERS' }).expect(
      201,
    );
    await create(sachini, { body: 'private', districtId: 'kandy' }).expect(201);

    await http().get(`/api/v1/posts/${friends.body.data.id}`).set('Authorization', arun.auth).expect(404);
    expect(
      bodies(await http().get('/api/v1/districts/kandy/posts').set('Authorization', arun.auth).expect(200)),
    ).toEqual([]);
    const locked = await http().get('/api/v1/users/sachini/posts').set('Authorization', arun.auth).expect(403);
    expect(locked.body.error.message).toMatch(/private/);

    await http().put('/api/v1/users/kasun/follow').set('Authorization', arun.auth).expect(200);
    await http().put('/api/v1/users/sachini/follow').set('Authorization', arun.auth).expect(200);
    await http().post('/api/v1/follow-requests/arun/accept').set('Authorization', sachini.auth).expect(200);
    expect(
      bodies(await http().get('/api/v1/districts/kandy/posts').set('Authorization', arun.auth).expect(200)),
    ).toEqual(['private', 'friends only']);
    expect(bodies(await http().get('/api/v1/users/sachini/posts').set('Authorization', arun.auth).expect(200))).toEqual(
      ['private'],
    );
  });

  it('lets only the author delete', async () => {
    const created = await create(kasun, { body: 'oops', districtId: 'kandy' }).expect(201);
    await http().delete(`/api/v1/posts/${created.body.data.id}`).set('Authorization', arun.auth).expect(403);
    await http().delete(`/api/v1/posts/${created.body.data.id}`).set('Authorization', kasun.auth).expect(200);
    await http().get(`/api/v1/posts/${created.body.data.id}`).set('Authorization', kasun.auth).expect(404);
    await http().get('/api/v1/posts/not-a-uuid').set('Authorization', kasun.auth).expect(400);
  });
});
