import express from 'express';
import { pinoHttp } from 'pino-http';
import { Writable } from 'node:stream';
import request from 'supertest';
import { httpLoggerOptions, requestIdFor } from './logger.options.js';

/** A tiny app logging through our options into memory, so tests see exactly what production would write. */
function appWithLogs(handler: express.RequestHandler = (_req, res) => void res.json({ ok: true })) {
  const lines: Record<string, unknown>[] = [];
  const sink = new Writable({
    write(chunk: Buffer, _enc, done) {
      lines.push(
        ...chunk
          .toString()
          .trim()
          .split('\n')
          .map((l) => JSON.parse(l) as Record<string, unknown>),
      );
      done();
    },
  });
  const app = express();
  app.use(pinoHttp({ ...httpLoggerOptions({ level: 'info', pretty: false }), stream: sink }));
  app.use((req, _res, next) => {
    if (req.headers['x-test-user'])
      (req as express.Request & { user?: { id: string } }).user = { id: String(req.headers['x-test-user']) };
    next();
  });
  app.all('/{*any}', handler);
  return { app, lines };
}

describe('requestIdFor', () => {
  it('keeps a sensible incoming id (e.g. from the load balancer) and makes one up otherwise', () => {
    expect(requestIdFor('abc12345-DEF_67.89')).toBe('abc12345-DEF_67.89');
    for (const bad of [undefined, '', 'short', 'x'.repeat(65), 'has spaces in it', 'bad\nnewline', ['a', 'b']])
      expect(requestIdFor(bad)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('request logs', () => {
  it('writes one JSON line per request: method, path, status, time, request id and user', async () => {
    const { app, lines } = appWithLogs();
    const res = await request(app).get('/api/v1/feed?cursor=abc').set('x-test-user', 'u-1').expect(200);
    const [line] = lines;
    expect(line).toMatchObject({
      level: 30,
      msg: 'request completed',
      req: { id: res.headers['x-request-id'], method: 'GET', url: '/api/v1/feed' },
      res: { statusCode: 200 },
      userId: 'u-1',
      responseTime: expect.any(Number),
    });
  });

  it('logs 4xx as warnings and 5xx as errors', async () => {
    const { app, lines } = appWithLogs((req, res) => void res.status(Number(req.query['status'])).end());
    await request(app).get('/x?status=404');
    await request(app).get('/x?status=503');
    expect(lines.map((l) => l['level'])).toEqual([40, 50]);
  });

  it('never writes login tokens, cookies, the CSRF header, set-cookie or query strings (OAuth codes)', async () => {
    const { app, lines } = appWithLogs((_req, res) => void res.cookie('refresh_token', 'SECRET-COOKIE-OUT').json({}));
    await request(app)
      .get('/api/v1/auth/google/callback?code=SECRET-CODE&state=SECRET-STATE')
      .set('Authorization', 'Bearer SECRET-TOKEN')
      .set('Cookie', 'access_token=SECRET-COOKIE-IN')
      .set('x-csrf-token', 'SECRET-CSRF');
    const written = JSON.stringify(lines);
    expect(written).not.toMatch(/SECRET/);
    expect(lines[0]).toMatchObject({ req: { url: '/api/v1/auth/google/callback' } });
  });

  it('echoes the request id back, so a user’s error can be found in the logs', async () => {
    const { app } = appWithLogs();
    const res = await request(app).get('/x').set('x-request-id', 'from-the-alb-12345');
    expect(res.headers['x-request-id']).toBe('from-the-alb-12345');
  });

  it('skips the load balancer’s health checks, which would drown everything else', async () => {
    const { app, lines } = appWithLogs();
    await request(app).get('/api/v1/health');
    await request(app).get('/api/v1/feed');
    expect(lines.map((l) => (l['req'] as { url: string }).url)).toEqual(['/api/v1/feed']);
  });
});
