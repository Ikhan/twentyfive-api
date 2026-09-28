import { randomUUID } from 'node:crypto';
import { resetDatabase } from '../../../test/helpers/test-db.js';
import { testPrismaService } from '../../../test/helpers/test-prisma-service.js';
import { PrismaMediaRepository } from './prisma-media.repository.js';

describe('PrismaMediaRepository (integration)', () => {
  const prisma = testPrismaService();
  const media = new PrismaMediaRepository(prisma);
  let owner: string;
  let other: string;

  beforeAll(() => prisma.onModuleInit());
  afterAll(() => prisma.onModuleDestroy());
  beforeEach(async () => {
    await resetDatabase(prisma);
    owner = (await prisma.user.create({ data: { username: 'kasun', displayName: 'Kasun' } })).id;
    other = (await prisma.user.create({ data: { username: 'arun', displayName: 'Arun' } })).id;
  });

  const newMedia = (ownerId: string, purpose: 'POST_PHOTO' | 'AVATAR' = 'POST_PHOTO') => {
    const id = randomUUID();
    return media.create({ id, ownerId, purpose, key: `${purpose}/${ownerId}/${id}.jpg`, contentType: 'image/jpeg' });
  };

  it('creates pending media and finds it', async () => {
    const created = await newMedia(owner);
    expect(created).toMatchObject({ status: 'PENDING', sizeBytes: null, ownerId: owner });
    await expect(media.findById(created.id)).resolves.toEqual(created);
    await expect(media.findById(randomUUID())).resolves.toBeNull();
  });

  it('marks media ready with its size', async () => {
    const created = await newMedia(owner);
    await expect(media.markReady(created.id, 1234)).resolves.toMatchObject({ status: 'READY', sizeBytes: 1234 });
  });

  it('finds only ready media of the right owner and purpose', async () => {
    const ready = await newMedia(owner);
    await media.markReady(ready.id, 10);
    const pending = await newMedia(owner);
    const avatar = await newMedia(owner, 'AVATAR');
    await media.markReady(avatar.id, 10);
    const foreign = await newMedia(other);
    await media.markReady(foreign.id, 10);

    const found = await media.findReady(owner, [ready.id, pending.id, avatar.id, foreign.id], 'POST_PHOTO');
    expect(found.map((m) => m.id)).toEqual([ready.id]);
  });
});
