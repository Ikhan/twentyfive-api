import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { DISTRICTS } from './seed-data/districts.js';

/** Idempotent: safe to run on every deploy. Updates districts in place, never deletes. */
async function seed(): Promise<void> {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }) });
  try {
    for (const district of DISTRICTS) {
      await prisma.district.upsert({ where: { id: district.id }, create: district, update: district });
    }
    console.info(`Seeded ${DISTRICTS.length} districts.`);
  } finally {
    await prisma.$disconnect();
  }
}

await seed();
