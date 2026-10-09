import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { MediaPurpose, MediaStatus } from '../src/generated/prisma/enums.js';
import type { AppConfigService } from '../src/config/app-config.service.js';
import { validateEnv } from '../src/config/env.schema.js';
import { SharpPhotoPreviewer } from '../src/modules/media/photo-preview.js';
import { createObjectStorage } from '../src/modules/media/storage/storage.factory.js';

/**
 * One-off: makes the size and blurred preview for post photos verified before previews existed.
 * Safe to re-run; it only touches photos that still have no preview.
 *
 *   npm run media:backfill-previews
 */
const BATCH = 50;

async function main(): Promise<void> {
  const env = validateEnv(process.env);
  const storage = createObjectStorage({ get: (key: keyof typeof env) => env[key] } as AppConfigService);
  if (!storage.configured) throw new Error('Set the S3_* settings in .env (see .env.example).');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
  const previewer = new SharpPhotoPreviewer();
  const counts = { done: 0, failed: 0 };
  try {
    const failed = new Set<string>();
    for (;;) {
      const photos = await prisma.media.findMany({
        where: {
          purpose: MediaPurpose.POST_PHOTO,
          status: MediaStatus.READY,
          placeholder: null,
          id: { notIn: [...failed] },
        },
        select: { id: true, key: true, sizeBytes: true },
        take: BATCH,
      });
      if (photos.length === 0) break;
      for (const photo of photos) {
        const sizeBytes = photo.sizeBytes ?? (await storage.stat(photo.key))?.sizeBytes ?? 0;
        const preview =
          sizeBytes > 0 ? await previewer.preview(await storage.readRange(photo.key, 0, sizeBytes)) : null;
        if (!preview) {
          failed.add(photo.id);
          counts.failed += 1;
          console.warn(`Couldn’t make a preview for ${photo.id} (${photo.key})`);
          continue;
        }
        await prisma.media.update({ where: { id: photo.id }, data: preview });
        counts.done += 1;
      }
    }
    console.info(`Made ${counts.done} photo previews; ${counts.failed} couldn’t be made.`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
