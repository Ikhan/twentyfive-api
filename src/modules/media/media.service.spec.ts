import { FakeObjectStorage, HTML, InMemoryMediaRepository, JPEG, PNG } from '../../../test/fakes/media-fakes.js';
import { InvalidUploadError, MediaNotFoundError } from './media.errors.js';
import { MediaService } from './media.service.js';

const MB = 1024 * 1024;

function setup() {
  const repo = new InMemoryMediaRepository();
  const storage = new FakeObjectStorage();
  return { repo, storage, service: new MediaService(repo, storage) };
}

/** Reserve an upload and simulate the browser putting `bytes` into storage. */
async function upload(
  ctx: ReturnType<typeof setup>,
  bytes = JPEG,
  size = 2000,
  contentType = 'image/jpeg',
  purpose: 'POST_PHOTO' | 'AVATAR' = 'POST_PHOTO',
) {
  const ticket = await ctx.service.createUpload('u1', { purpose, contentType, sizeBytes: size });
  ctx.storage.put(ctx.storage.presigned.at(-1)!.key, bytes, size);
  return ticket;
}

describe('MediaService', () => {
  describe('createUpload', () => {
    it('issues a presigned form locked to the key, type and size limit', async () => {
      const ctx = setup();
      const ticket = await ctx.service.createUpload('u1', {
        purpose: 'POST_PHOTO',
        contentType: 'image/png',
        sizeBytes: 500,
      });
      expect(ticket).toMatchObject({
        mediaId: expect.any(String),
        maxBytes: 10 * MB,
        upload: { url: 'https://storage.test/bucket' },
      });
      expect(ctx.storage.presigned[0]).toMatchObject({
        key: `post_photo/u1/${ticket.mediaId}.png`,
        contentType: 'image/png',
        maxBytes: 10 * MB,
      });
      expect(ctx.repo.rows.get(ticket.mediaId)).toMatchObject({ status: 'PENDING', ownerId: 'u1' });
      expect(ticket.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('rejects other file types and oversized files (smaller limit for avatars)', async () => {
      const { service } = setup();
      await expect(
        service.createUpload('u1', { purpose: 'POST_PHOTO', contentType: 'image/gif', sizeBytes: 10 }),
      ).rejects.toBeInstanceOf(InvalidUploadError);
      await expect(
        service.createUpload('u1', { purpose: 'POST_PHOTO', contentType: 'image/jpeg', sizeBytes: 11 * MB }),
      ).rejects.toThrow('10 MB');
      await expect(
        service.createUpload('u1', { purpose: 'AVATAR', contentType: 'image/jpeg', sizeBytes: 6 * MB }),
      ).rejects.toThrow('5 MB');
    });
  });

  describe('complete', () => {
    it('verifies a real image and marks it ready (idempotently)', async () => {
      const ctx = setup();
      const ticket = await upload(ctx);
      const view = await ctx.service.complete('u1', ticket.mediaId);
      expect(view).toEqual({
        id: ticket.mediaId,
        url: expect.stringMatching(/^https:\/\/cdn\.test\/post_photo\/u1\//),
        contentType: 'image/jpeg',
        sizeBytes: 2000,
      });
      await expect(ctx.service.complete('u1', ticket.mediaId)).resolves.toEqual(view);
    });

    it('404s for other people’s or unknown uploads', async () => {
      const ctx = setup();
      const ticket = await upload(ctx);
      await expect(ctx.service.complete('someone-else', ticket.mediaId)).rejects.toBeInstanceOf(MediaNotFoundError);
      await expect(ctx.service.complete('u1', 'missing')).rejects.toBeInstanceOf(MediaNotFoundError);
    });

    it('says when nothing was uploaded yet', async () => {
      const ctx = setup();
      const ticket = await ctx.service.createUpload('u1', {
        purpose: 'POST_PHOTO',
        contentType: 'image/jpeg',
        sizeBytes: 10,
      });
      await expect(ctx.service.complete('u1', ticket.mediaId)).rejects.toThrow('hasn’t finished uploading');
    });

    it('deletes and rejects spoofed files and wrong types', async () => {
      const ctx = setup();
      const html = await upload(ctx, HTML);
      await expect(ctx.service.complete('u1', html.mediaId)).rejects.toThrow('isn’t a valid');
      expect(ctx.storage.deleted).toHaveLength(1);
      const pngAsJpeg = await upload(ctx, PNG);
      await expect(ctx.service.complete('u1', pngAsJpeg.mediaId)).rejects.toBeInstanceOf(InvalidUploadError);
    });

    it('deletes and rejects files over the limit (declared small, uploaded big)', async () => {
      const ctx = setup();
      const ticket = await ctx.service.createUpload('u1', {
        purpose: 'AVATAR',
        contentType: 'image/jpeg',
        sizeBytes: 1000,
      });
      ctx.storage.put(ctx.storage.presigned[0]!.key, JPEG, 6 * MB);
      await expect(ctx.service.complete('u1', ticket.mediaId)).rejects.toThrow('too large');
      expect(ctx.storage.objects.size).toBe(0);
    });
  });

  describe('claim', () => {
    it('returns ready photos in the requested order, ignoring duplicates', async () => {
      const ctx = setup();
      const a = await upload(ctx);
      const b = await upload(ctx);
      await ctx.service.complete('u1', a.mediaId);
      await ctx.service.complete('u1', b.mediaId);
      const claimed = await ctx.service.claim('u1', [b.mediaId, a.mediaId, b.mediaId], 'POST_PHOTO');
      expect(claimed.map((m) => m.id)).toEqual([b.mediaId, a.mediaId]);
    });

    it('rejects pending, foreign or wrong-purpose photos', async () => {
      const ctx = setup();
      const pending = await upload(ctx);
      await expect(ctx.service.claim('u1', [pending.mediaId], 'POST_PHOTO')).rejects.toBeInstanceOf(InvalidUploadError);
      await ctx.service.complete('u1', pending.mediaId);
      await expect(ctx.service.claim('u2', [pending.mediaId], 'POST_PHOTO')).rejects.toBeInstanceOf(InvalidUploadError);
      await expect(ctx.service.claim('u1', [pending.mediaId], 'AVATAR')).rejects.toBeInstanceOf(InvalidUploadError);
    });
  });
});
