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

    // Once attached to a post, it's no longer available.
    const post = await prisma.post.create({ data: { authorId: owner, districtId: 'kandy', body: 'x' } });
    await prisma.postPhoto.create({ data: { postId: post.id, mediaId: ready.id, url: 'u', position: 0 } });
    await expect(media.findReady(owner, [ready.id], 'POST_PHOTO')).resolves.toEqual([]);
  });

  it('keeps a video’s length and size, and each video is used by one post only', async () => {
    const id = randomUUID();
    await media.create({
      id,
      ownerId: owner,
      purpose: 'POST_VIDEO',
      key: `post_video/${owner}/${id}.mp4`,
      contentType: 'video/mp4',
    });
    const details = { durationSeconds: 125.5, width: 1280, height: 720 };
    await expect(media.markReady(id, 9_000_000, details)).resolves.toMatchObject({ status: 'READY', video: details });
    await expect(media.findById(id)).resolves.toMatchObject({ video: details });
    expect((await newMedia(owner)).video).toBeNull(); // photos have none
    await expect(media.findReady(owner, [id], 'POST_VIDEO')).resolves.toHaveLength(1);
    const post = await prisma.post.create({ data: { authorId: owner, body: 'clip' } });
    await prisma.postVideo.create({ data: { postId: post.id, mediaId: id, url: 'u', ...details } });
    await expect(media.findReady(owner, [id], 'POST_VIDEO')).resolves.toEqual([]);
  });
});
