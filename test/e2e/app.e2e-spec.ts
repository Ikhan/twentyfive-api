import { Body, Controller, Get, Post, type INestApplication } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import request from 'supertest';
import { Public } from '../../src/common/decorators/public.decorator.js';
import { createTestApp } from '../helpers/create-test-app.js';

class EchoDto {
  @IsString()
  @MaxLength(5)
  text!: string;
}

/** Test-only routes to exercise global behaviour (validation, throttling, errors). */
@Public()
@Controller('test-probe')
class ProbeController {
  @Get()
  ping(): { pong: true } {
    return { pong: true };
  }

  @Post('echo')
  echo(@Body() dto: EchoDto): EchoDto {
    return dto;
  }

  @Get('boom')
  boom(): never {
    throw new Error('database password leaked in message');
  }
}

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp({
      env: { RATE_LIMIT_MAX: '3', CORS_ORIGINS: 'http://localhost:5173' },
      extraControllers: [ProbeController],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('GET /api/v1/health returns the success envelope', async () => {
    const res = await http().get('/api/v1/health').expect(200);
    expect(res.body).toMatchObject({ success: true, error: null, data: { status: 'ok', checks: { database: 'up' } } });
  });

  it('sends security headers', async () => {
    const res = await http().get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows the web app origin with credentials and ignores others', async () => {
    const ok = await http().get('/api/v1/health').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const other = await http().get('/api/v1/health').set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('returns the error envelope for unknown routes', async () => {
    const res = await http().get('/api/v1/nope').expect(404);
    expect(res.body).toMatchObject({ success: false, data: null, error: { code: 'NOT_FOUND' } });
  });

  it('rejects invalid and unknown fields', async () => {
    const tooLong = await http().post('/api/v1/test-probe/echo').send({ text: 'too long' }).expect(400);
    expect(tooLong.body.error.code).toBe('VALIDATION_FAILED');
    const extra = await http().post('/api/v1/test-probe/echo').send({ text: 'ok', isAdmin: true }).expect(400);
    expect(extra.body.error.details).toEqual(expect.arrayContaining([expect.stringContaining('isAdmin')]));
  });

  it('hides internal error details', async () => {
    const res = await http().get('/api/v1/test-probe/boom').expect(500);
    expect(res.body.error).toEqual({ code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' });
  });

  it('rate-limits clients (health is exempt)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await http().get('/api/v1/test-probe')).status);
    expect(statuses).toContain(429);
    await http().get('/api/v1/health').expect(200);
  });

  it('serves OpenAPI docs outside production', async () => {
    await http().get('/api/docs-json').expect(200);
  });
});
