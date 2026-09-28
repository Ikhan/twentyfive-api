import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { TEST_DATABASE_URL } from '../setup/test-env.js';

/** Reference data that tests rely on and must survive resets. */
const KEEP_TABLES = new Set(['_prisma_migrations', 'districts']);

export function createTestPrisma(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL }) });
}

/** Empties every feature table (keeps districts) so each test starts clean. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  const tables = rows.map((r) => r.tablename).filter((t) => !KEEP_TABLES.has(t));
  if (tables.length > 0) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
  }
}
