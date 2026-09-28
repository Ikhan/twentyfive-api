import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../../src/config/app-config.service.js';
import { validateEnv } from '../../src/config/env.schema.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { TEST_DATABASE_URL, TEST_JWT_SECRET } from '../setup/test-env.js';

/** A real PrismaService pointed at the test database, for repository integration tests. */
export function testPrismaService(): PrismaService {
  const env = validateEnv({ DATABASE_URL: TEST_DATABASE_URL, JWT_ACCESS_SECRET: TEST_JWT_SECRET });
  return new PrismaService(new AppConfigService(new ConfigService(env) as never));
}
