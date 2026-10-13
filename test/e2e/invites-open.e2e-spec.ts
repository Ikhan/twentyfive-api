import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../helpers/create-test-app.js';
import { createTestPrisma, resetDatabase } from '../helpers/test-db.js';
import { createUser } from '../helpers/users.js';

/** Once twentyfive is open to everyone (INVITE_ONLY=false), the invite feature is gone. */
describe('Invites (e2e, open to everyone)', () => {
  let app: INestApplication;
  const prisma = createTestPrisma();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({ env: { INVITE_ONLY: 'false' } });
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });
  beforeEach(() => resetDatabase(prisma));

  it('says no invite is needed, and the invite and waitlist endpoints are gone', async () => {
    expect((await http().get('/api/v1/invites/status').expect(200)).body.data).toEqual({ inviteOnly: false });
    const user = await createUser(app, prisma, { username: 'amaya' });
    await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
    await http().get('/api/v1/invites').set('Authorization', user.auth).expect(404);
    await http().post('/api/v1/invites').set('Authorization', user.auth).expect(404);
    await http().get('/api/v1/invites/K7M2QX9PRT').expect(404);
    await http().post('/api/v1/waitlist').send({ name: 'Dilini', email: 'dilini@example.lk' }).expect(404);
    await http().get('/api/v1/admin/waitlist').set('Authorization', user.auth).expect(404);
  });

  it('keeps admin bans working', async () => {
    const imran = await createUser(app, prisma, { username: 'imran' });
    await prisma.user.update({ where: { id: imran.id }, data: { role: 'ADMIN' } });
    await createUser(app, prisma, { username: 'amaya' });
    await http().put('/api/v1/admin/users/amaya/ban').set('Authorization', imran.auth).expect(200);
    await http().get('/api/v1/users/amaya').set('Authorization', imran.auth).expect(404);
  });
});
