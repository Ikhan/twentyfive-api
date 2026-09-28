import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type { AppConfigService } from '../src/config/app-config.service.js';
import { AccessTokenService } from '../src/modules/auth/tokens/access-token.service.js';

/**
 * Local development only: prints an access token for API clients (Yaak, Postman, curl), so you can
 * call the API without the OAuth sign-in. Creates the user (onboarded, from Kandy) if needed.
 *
 *   npm run dev:token -- kasun
 */
const TTL_MINUTES = 12 * 60;

async function main(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') throw new Error('dev:token is for local development only.');
  const secret = process.env['JWT_ACCESS_SECRET'];
  const databaseUrl = process.env['DATABASE_URL'];
  if (!secret || !databaseUrl) throw new Error('Set JWT_ACCESS_SECRET and DATABASE_URL in .env (see .env.example).');

  const username = (process.argv[2] ?? 'kasun').toLowerCase();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    const user = await prisma.user.upsert({
      where: { username },
      update: {},
      create: { username, displayName: username, hometownId: 'kandy', onboardedAt: new Date() },
    });
    const config = { get: (key: string) => (key === 'JWT_ACCESS_SECRET' ? secret : TTL_MINUTES) };
    const token = await new AccessTokenService(config as unknown as AppConfigService).sign(user.id);
    process.stdout.write(`@${username} (${user.id}), valid for ${TTL_MINUTES / 60} hours:\n${token}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
