import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PAGE_FETCHER, type PageFetcher } from '../../src/modules/links/page-fetcher.js';
import { createTestApp } from '../helpers/create-test-app.js';
import { createTestPrisma, resetDatabase } from '../helpers/test-db.js';
import { createUser, type TestUser } from '../helpers/users.js';

const NYT = 'https://www.nytimes.com/international/';
const PAGES: Record<string, string> = {
  [NYT]: `<head><meta property="og:title" content="International News"><meta property="og:image" content="https://static01.nyt.com/card.jpg"><meta property="og:site_name" content="The New York Times"></head>`,
};

describe('Link previews (e2e)', () => {
  let app: INestApplication;
  const prisma = createTestPrisma();
  const http = () => request(app.getHttpServer());
  const fetched: string[] = [];
  const fakePages: PageFetcher = {
    fetchPage: async (url) => {
      fetched.push(url);
      return PAGES[url] ? { url, html: PAGES[url] } : null;
    },
  };
  let kasun: TestUser;

  beforeAll(async () => {
    app = await createTestApp({ overrides: [{ token: PAGE_FETCHER, value: fakePages }] });
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    kasun = await createUser(app, prisma, { username: 'kasun' });
  });

  it('previews a link for the composer, then keeps the card with the post', async () => {
    const card = await http()
      .get('/api/v1/link-preview')
      .query({ url: NYT })
      .set('Authorization', kasun.auth)
      .expect(200);
    expect(card.body.data).toEqual({
      url: NYT,
      title: 'International News',
      description: null,
      image: 'https://static01.nyt.com/card.jpg',
      siteName: 'The New York Times',
    });
    const post = await http()
      .post('/api/v1/posts')
      .set('Authorization', kasun.auth)
      .send({ body: `Read this ${NYT}` })
      .expect(201);
    expect(post.body.data.link).toMatchObject({ title: 'International News' });
    const feed = await http().get('/api/v1/feed').set('Authorization', kasun.auth).expect(200);
    expect(feed.body.data[0].link).toMatchObject({ siteName: 'The New York Times' });
    expect(fetched.filter((u) => u === NYT)).toHaveLength(1); // the composer's lookup was reused
  });

  it('answers null for pages without a card or links it won’t fetch, and validates the URL', async () => {
    const ask = (url: string) => http().get('/api/v1/link-preview').query({ url }).set('Authorization', kasun.auth);
    expect((await ask('https://nothing.lk/').expect(200)).body.data).toBeNull();
    expect((await ask('http://169.254.169.254/latest/meta-data/').expect(200)).body.data).toBeNull();
    expect(fetched).not.toContain('http://169.254.169.254/latest/meta-data/');
    await ask('javascript:alert(1)').expect(400);
    await ask('not a url').expect(400);
    await http().get('/api/v1/link-preview').query({ url: NYT }).expect(401);
  });
});
