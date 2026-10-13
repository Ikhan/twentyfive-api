import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * Makes an existing account an admin (unlimited invites, the waitlist, bans), or back with --remove.
 * Run once per environment for the founder's account:
 *
 *   npm run users:make-admin -- imran
 *   npm run users:make-admin -- imran --remove
 */
async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) throw new Error('Set DATABASE_URL (see .env.example).');
  const args = process.argv.slice(2);
  const username = args.find((a) => !a.startsWith('--'))?.toLowerCase();
  if (!username) throw new Error('Usage: npm run users:make-admin -- <username> [--remove]');
  const role = args.includes('--remove') ? 'USER' : 'ADMIN';

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    const { count } = await prisma.user.updateMany({ where: { username }, data: { role } });
    if (count === 0) throw new Error(`No account @${username}. Sign up first, then run this.`);
    process.stdout.write(`@${username} is now ${role === 'ADMIN' ? 'an admin' : 'a regular user'}.\n`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
