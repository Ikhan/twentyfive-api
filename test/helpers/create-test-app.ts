import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TEST_DATABASE_URL, TEST_JWT_SECRET } from '../setup/test-env.js';

/**
 * Boots the real AppModule with production middleware (configureApp).
 * ConfigModule reads process.env when app.module is first imported, so the env
 * overrides are applied first and the app modules are imported afterwards.
 * (Vitest isolates each test file, so every file gets a fresh import.)
 */
export interface TestAppOptions {
  env?: Record<string, string>;
  extraControllers?: Type[];
  /** Replace providers by injection token, e.g. a fake OAuth provider. */
  overrides?: { token: unknown; value: unknown }[];
}

export async function createTestApp(options: TestAppOptions = {}): Promise<INestApplication> {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    JWT_ACCESS_SECRET: TEST_JWT_SECRET,
    LOG_LEVEL: 'silent',
    // Open sign-up, so feature tests can sign people up freely; the invites tests switch it on.
    INVITE_ONLY: 'false',
    ...options.env,
  });
  const { AppModule } = await import('../../src/app.module.js');
  const { configureApp } = await import('../../src/app.setup.js');
  const builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: options.extraControllers ?? [],
  });
  for (const { token, value } of options.overrides ?? []) builder.overrideProvider(token).useValue(value);
  const moduleRef = await builder.compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  return app;
}
