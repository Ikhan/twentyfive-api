import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TEST_DATABASE_URL } from '../setup/test-env.js';

/**
 * Boots the real AppModule with production middleware (configureApp).
 * ConfigModule reads process.env when app.module is first imported, so the env
 * overrides are applied first and the app modules are imported afterwards.
 * (Vitest isolates each test file, so every file gets a fresh import.)
 */
export async function createTestApp(
  options: { env?: Record<string, string>; extraControllers?: Type[] } = {},
): Promise<INestApplication> {
  Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL, ...options.env });
  const { AppModule } = await import('../../src/app.module.js');
  const { configureApp } = await import('../../src/app.setup.js');
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: options.extraControllers ?? [],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  return app;
}
