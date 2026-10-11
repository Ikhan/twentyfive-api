import { Controller, Get, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Public } from '../../src/common/decorators/public.decorator.js';
import { createTestApp } from '../helpers/create-test-app.js';

@Controller('boom')
class BoomController {
  @Public()
  @Get()
  boom(): never {
    throw new Error('database exploded');
  }
}

describe('Observability (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({ extraControllers: [BoomController] });
  });
  afterAll(() => app.close());

  it('gives every response a request id, keeping a sensible one sent by the load balancer', async () => {
    const made = await http().get('/api/v1/districts');
    expect(made.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const kept = await http().get('/api/v1/districts').set('x-request-id', 'alb-trace-1234567');
    expect(kept.headers['x-request-id']).toBe('alb-trace-1234567');
  });

  it('puts the request id in error responses, so a user can quote it', async () => {
    const res = await http().get('/api/v1/posts/00000000-0000-4000-8000-000000000000').expect(401);
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('keeps crashes generic for the user, with the id to find the logged stack trace', async () => {
    const res = await http().get('/api/v1/boom').expect(500);
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
      requestId: res.headers['x-request-id'],
    });
    expect(JSON.stringify(res.body)).not.toMatch(/exploded/);
  });
});
