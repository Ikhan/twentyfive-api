import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { OAUTH_PROVIDERS } from '../../src/modules/auth/oauth/oauth-provider.js';
import { INVITES_PER_PERSON } from '../../src/modules/invites/invites.types.js';
import { FakeOAuthProvider } from '../fakes/auth-fakes.js';
import { CookieJar } from '../helpers/cookie-jar.js';
import { createTestApp } from '../helpers/create-test-app.js';
import { createTestPrisma, resetDatabase } from '../helpers/test-db.js';
import { createUser, type TestUser } from '../helpers/users.js';

describe('Invites (e2e, invite-only)', () => {
  let app: INestApplication;
  const provider = new FakeOAuthProvider();
  const prisma = createTestPrisma();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({
      env: { INVITE_ONLY: 'true', WEB_APP_URL: 'http://web.test', API_PUBLIC_URL: 'http://api.test' },
      overrides: [{ token: OAUTH_PROVIDERS, value: [provider] }],
    });
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    provider.profile = { providerAccountId: 'g-kasun', displayName: 'Kasun Perera', email: 'kasun@example.lk' };
  });

  /** start (with the invite, like the invite page's buttons) → provider → callback. */
  async function signIn(invite?: string) {
    const jar = new CookieJar();
    const start = await http()
      .get(`/api/v1/auth/google/start${invite ? `?invite=${invite}` : ''}`)
      .expect(302);
    jar.update(start);
    const state = new URL(start.headers.location as string).searchParams.get('state')!;
    const callback = await http()
      .get(`/api/v1/auth/google/callback?code=good-code&state=${state}`)
      .set('Cookie', jar.header())
      .expect(302);
    jar.update(callback);
    return { jar, location: callback.headers.location as string };
  }

  const makeInvite = async (user: TestUser) =>
    (await http().post('/api/v1/invites').set('Authorization', user.auth).expect(201)).body.data as {
      code: string;
      status: string;
    };

  async function admin(): Promise<TestUser> {
    const user = await createUser(app, prisma, { username: 'imran' });
    await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
    return user;
  }

  it('says sign-up is invite-only', async () => {
    const res = await http().get('/api/v1/invites/status').expect(200);
    expect(res.body.data).toEqual({ inviteOnly: true });
  });

  it('turns away new people without an invite, creating no account', async () => {
    const { location, jar } = await signIn();
    expect(location).toBe('http://web.test/signin?error=invite_required');
    expect(jar.get('access_token')).toBeUndefined();
    expect(await prisma.user.count()).toBe(0);
  });

  it('signs someone up with an invite link, once, and remembers who invited them', async () => {
    const amaya = await createUser(app, prisma, { username: 'amaya', displayName: 'Amaya' });
    const invite = await makeInvite(amaya);
    expect(invite).toMatchObject({ status: 'pending', code: expect.stringMatching(/^[2-9A-Z]{10}$/) });

    const preview = await http().get(`/api/v1/invites/${invite.code.toLowerCase()}`).expect(200);
    expect(preview.body.data.inviter).toMatchObject({ username: 'amaya', displayName: 'Amaya' });

    const { location } = await signIn(invite.code);
    expect(location).toBe('http://web.test/onboarding');
    const kasun = await prisma.user.findFirstOrThrow({ where: { username: 'kasunperera' } });
    expect(kasun.invitedById).toBe(amaya.id);

    const mine = await http().get('/api/v1/invites').set('Authorization', amaya.auth).expect(200);
    expect(mine.body.data).toMatchObject({ unlimited: false, admin: false, remaining: INVITES_PER_PERSON - 1 });
    expect(mine.body.data.invites).toEqual([
      expect.objectContaining({
        code: invite.code,
        status: 'used',
        usedBy: expect.objectContaining({ username: 'kasunperera' }),
      }),
    ]);

    // The link is single-use.
    await http().get(`/api/v1/invites/${invite.code}`).expect(404);
    provider.profile = { providerAccountId: 'g-nimal', displayName: 'Nimal Silva' };
    expect((await signIn(invite.code)).location).toBe('http://web.test/signin?error=invite_invalid');
    expect(await prisma.user.count({ where: { username: 'nimalsilva' } })).toBe(0);
  });

  it('turns away expired invites, and their slot comes back', async () => {
    const amaya = await createUser(app, prisma, { username: 'amaya' });
    const invite = await makeInvite(amaya);
    await prisma.invite.update({ where: { code: invite.code }, data: { expiresAt: new Date(Date.now() - 1000) } });

    expect((await signIn(invite.code)).location).toBe('http://web.test/signin?error=invite_invalid');
    const mine = await http().get('/api/v1/invites').set('Authorization', amaya.auth).expect(200);
    expect(mine.body.data.remaining).toBe(INVITES_PER_PERSON);
    expect(mine.body.data.invites[0].status).toBe('expired');
  });

  it(`gives everyone ${INVITES_PER_PERSON} invites, and admins as many as they like`, async () => {
    const amaya = await createUser(app, prisma, { username: 'amaya' });
    for (let i = 0; i < INVITES_PER_PERSON; i++) await makeInvite(amaya);
    const over = await http().post('/api/v1/invites').set('Authorization', amaya.auth).expect(409);
    expect(over.body.error.message).toMatch(/used all your invites/);

    const imran = await admin();
    for (let i = 0; i < INVITES_PER_PERSON + 1; i++) await makeInvite(imran);
    const mine = await http().get('/api/v1/invites').set('Authorization', imran.auth).expect(200);
    expect(mine.body.data).toMatchObject({ unlimited: true, admin: true, remaining: null });
    expect(mine.body.data.invites).toHaveLength(INVITES_PER_PERSON + 1);
  });

  it('never lets two quick requests go over the limit', async () => {
    const amaya = await createUser(app, prisma, { username: 'amaya' });
    for (let i = 0; i < INVITES_PER_PERSON - 1; i++) await makeInvite(amaya);
    const both = await Promise.all([1, 2].map(() => http().post('/api/v1/invites').set('Authorization', amaya.auth)));
    expect(both.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('takes waitlist sign-ups, which an admin turns into invite links', async () => {
    const join = (body: object) => http().post('/api/v1/waitlist').send(body);
    await join({ name: 'Dilini', email: 'Dilini@Example.lk', districtId: 'galle' }).expect(200);
    await join({ name: 'Dilini again', email: 'dilini@example.lk' }).expect(200); // same answer, no duplicate
    await join({ name: 'X', email: 'not-an-email' }).expect(400);
    await join({ name: 'X', email: 'x@example.lk', districtId: 'atlantis' }).expect(400);

    const amaya = await createUser(app, prisma, { username: 'amaya' });
    await http().get('/api/v1/admin/waitlist').set('Authorization', amaya.auth).expect(403);

    const imran = await admin();
    const list = await http().get('/api/v1/admin/waitlist').set('Authorization', imran.auth).expect(200);
    expect(list.body.data).toEqual([
      expect.objectContaining({
        name: 'Dilini',
        email: 'dilini@example.lk',
        district: { id: 'galle', name: 'Galle' },
        invite: null,
      }),
    ]);

    const entryId = list.body.data[0].id as string;
    await http().post(`/api/v1/admin/waitlist/${entryId}/invite`).set('Authorization', amaya.auth).expect(403);
    const sent = await http()
      .post(`/api/v1/admin/waitlist/${entryId}/invite`)
      .set('Authorization', imran.auth)
      .expect(201);
    const after = await http().get('/api/v1/admin/waitlist').set('Authorization', imran.auth).expect(200);
    expect(after.body.data[0].invite).toEqual({ code: sent.body.data.code, status: 'pending' });

    provider.profile = { providerAccountId: 'g-dilini', displayName: 'Dilini' };
    expect((await signIn(sent.body.data.code)).location).toBe('http://web.test/onboarding');
  });

  it('bans: no sign-in, hidden everywhere, invites void, and the people they invited flagged', async () => {
    const imran = await admin();
    const amaya = await createUser(app, prisma, { username: 'amaya' });
    const viewer = await createUser(app, prisma, { username: 'ruwan' });
    // Kasun signs up with Amaya's invite; Amaya has another link out.
    await signIn((await makeInvite(amaya)).code);
    const unused = await makeInvite(amaya);
    await http()
      .post('/api/v1/posts')
      .set('Authorization', amaya.auth)
      .send({ body: 'hello from amaya', districtId: 'kandy' })
      .expect(201);
    const amayaAccount = await prisma.user.findUniqueOrThrow({ where: { id: amaya.id } });
    expect(amayaAccount.bannedAt).toBeNull();

    await http().put('/api/v1/admin/users/amaya/ban').set('Authorization', viewer.auth).expect(403);
    await http().put('/api/v1/admin/users/imran/ban').set('Authorization', imran.auth).expect(400);
    await http().put('/api/v1/admin/users/amaya/ban').set('Authorization', imran.auth).expect(200);

    await http().get('/api/v1/users/amaya').set('Authorization', viewer.auth).expect(404);
    const feed = await http().get('/api/v1/feed').set('Authorization', viewer.auth).expect(200);
    expect(feed.body.data.map((p: { body: string }) => p.body)).not.toContain('hello from amaya');
    await http().get(`/api/v1/invites/${unused.code}`).expect(404);

    const flagged = await http().get('/api/v1/admin/flagged').set('Authorization', imran.auth).expect(200);
    expect(flagged.body.data).toEqual([
      expect.objectContaining({
        user: expect.objectContaining({ username: 'kasunperera' }),
        reason: 'Invited by @amaya, who was banned',
        invitedBy: expect.objectContaining({ username: 'amaya' }),
      }),
    ]);
    await http().delete('/api/v1/admin/users/kasunperera/flag').set('Authorization', imran.auth).expect(200);
    expect((await http().get('/api/v1/admin/flagged').set('Authorization', imran.auth).expect(200)).body.data).toEqual(
      [],
    );

    await http().delete('/api/v1/admin/users/amaya/ban').set('Authorization', imran.auth).expect(200);
    await http().get('/api/v1/users/amaya').set('Authorization', viewer.auth).expect(200);
  });

  it('turns banned people away at sign-in and ends their sessions', async () => {
    const imran = await admin();
    const { jar } = await signIn((await makeInvite(imran)).code);
    await http().put('/api/v1/admin/users/kasunperera/ban').set('Authorization', imran.auth).expect(200);

    await http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', jar.header())
      .set('X-CSRF-Token', jar.get('csrf_token')!)
      .expect(401);
    expect((await signIn()).location).toBe('http://web.test/signin?error=banned');
  });
});
