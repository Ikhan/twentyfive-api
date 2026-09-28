import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { OBJECT_STORAGE } from '../../src/modules/media/storage/object-storage.js';
import { FakeObjectStorage, HTML, JPEG } from '../fakes/media-fakes.js';
import { createTestApp } from '../helpers/create-test-app.js';
import { createTestPrisma, resetDatabase } from '../helpers/test-db.js';
import { createUser, type TestUser } from '../helpers/users.js';

describe('Media and avatars (e2e)', () => {
  let app: INestApplication;
  const storage = new FakeObjectStorage();
  const prisma = createTestPrisma();
  const http = () => request(app.getHttpServer());
  let kasun: TestUser;
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
    kasun = await createUser(app, prisma, { username: 'kasun' });
    arun = await createUser(app, prisma, { username: 'arun' });
  });

  async function reserve(
    user: TestUser,
    body: object = { purpose: 'AVATAR', contentType: 'image/jpeg', sizeBytes: 2048 },
  ) {
    const res = await http().post('/api/v1/media/uploads').set('Authorization', user.auth).send(body).expect(201);
    return res.body.data as { mediaId: string; upload: { fields: { key: string } } };
  }

  it('upload → complete → use as avatar', async () => {
    const ticket = await reserve(kasun);
    expect(ticket.upload.fields.key).toMatch(new RegExp(`^avatar/${kasun.id}/${ticket.mediaId}\\.jpg$`));

    await http().post(`/api/v1/media/${ticket.mediaId}/complete`).set('Authorization', kasun.auth).expect(400); // not uploaded yet
    storage.put(ticket.upload.fields.key, JPEG, 2048);
    const done = await http()
      .post(`/api/v1/media/${ticket.mediaId}/complete`)
      .set('Authorization', kasun.auth)
      .expect(200);
    expect(done.body.data).toMatchObject({ id: ticket.mediaId, contentType: 'image/jpeg', sizeBytes: 2048 });

    const me = await http()
      .put('/api/v1/users/me/avatar')
      .set('Authorization', kasun.auth)
      .send({ mediaId: ticket.mediaId })
      .expect(200);
    expect(me.body.data.avatarUrl).toBe(done.body.data.url);
    const cleared = await http().delete('/api/v1/users/me/avatar').set('Authorization', kasun.auth).expect(200);
    expect(cleared.body.data.avatarUrl).toBeNull();
  });

  it('validates upload requests', async () => {
    const gif = await http()
      .post('/api/v1/media/uploads')
      .set('Authorization', kasun.auth)
      .send({ purpose: 'AVATAR', contentType: 'image/gif', sizeBytes: 10 })
      .expect(400);
    expect(gif.body.error.details).toEqual({ field: 'contentType' });
    await http()
      .post('/api/v1/media/uploads')
      .set('Authorization', kasun.auth)
      .send({ purpose: 'VIDEO', contentType: 'image/jpeg', sizeBytes: 10 })
      .expect(400);
    await http()
      .post('/api/v1/media/uploads')
      .set('Authorization', kasun.auth)
      .send({ purpose: 'AVATAR', contentType: 'image/jpeg', sizeBytes: 6 * 1024 * 1024 })
      .expect(400);
    await http()
      .post('/api/v1/media/uploads')
      .send({ purpose: 'AVATAR', contentType: 'image/jpeg', sizeBytes: 10 })
      .expect(401);
    await http().post('/api/v1/media/not-a-uuid/complete').set('Authorization', kasun.auth).expect(400);
  });

  it('rejects spoofed files and other people’s uploads', async () => {
    const ticket = await reserve(kasun);
    storage.put(ticket.upload.fields.key, HTML);
    await http().post(`/api/v1/media/${ticket.mediaId}/complete`).set('Authorization', arun.auth).expect(404);
    const res = await http()
      .post(`/api/v1/media/${ticket.mediaId}/complete`)
      .set('Authorization', kasun.auth)
      .expect(400);
    expect(res.body.error.message).toMatch(/isn’t a valid/);
    await http()
      .put('/api/v1/users/me/avatar')
      .set('Authorization', kasun.auth)
      .send({ mediaId: ticket.mediaId })
      .expect(400);
  });

  it('won’t let you use someone else’s photo as your avatar', async () => {
    const ticket = await reserve(arun);
    storage.put(ticket.upload.fields.key, JPEG);
    await http().post(`/api/v1/media/${ticket.mediaId}/complete`).set('Authorization', arun.auth).expect(200);
    await http()
      .put('/api/v1/users/me/avatar')
      .set('Authorization', kasun.auth)
      .send({ mediaId: ticket.mediaId })
      .expect(400);
  });
});

describe('Media without storage configured (e2e)', () => {
  it('returns 503 instead of crashing', async () => {
    const app = await createTestApp();
    const prisma = createTestPrisma();
    await resetDatabase(prisma);
    const kasun = await createUser(app, prisma, { username: 'kasun' });
    const res = await request(app.getHttpServer())
      .post('/api/v1/media/uploads')
      .set('Authorization', kasun.auth)
      .send({ purpose: 'AVATAR', contentType: 'image/jpeg', sizeBytes: 10 })
      .expect(503);
    expect(res.body.error.code).toBe('STORAGE_UNAVAILABLE');
    await app.close();
    await prisma.$disconnect();
  });
});
