import {
  FakeObjectStorage,
  FakePhotoPreviewer,
  FakeVideoProbe,
  HTML,
  InMemoryMediaRepository,
  JPEG,
  PNG,
} from '../../../test/fakes/media-fakes.js';
import { InvalidUploadError, MediaNotFoundError } from './media.errors.js';
import { readFileSync } from 'node:fs';
import { MediaService } from './media.service.js';
import { MediaInfoVideoProbe } from './video-probe.js';

const MB = 1024 * 1024;

function setup() {
  const repo = new InMemoryMediaRepository();
  const storage = new FakeObjectStorage();
  const previews = new FakePhotoPreviewer();
  return { repo, storage, previews, service: new MediaService(repo, storage, new FakeVideoProbe(), previews) };
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
        video: null,
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

    it('stores a post photo’s size and blurred preview, read from the whole file', async () => {
      const ctx = setup();
      const ticket = await upload(ctx, JPEG, 2000);
      await ctx.service.complete('u1', ticket.mediaId);
      expect(ctx.previews.seen).toEqual([2000]);
      expect(ctx.repo.rows.get(ticket.mediaId)).toMatchObject({
        status: 'READY',
        photo: { width: 1200, height: 800, placeholder: 'data:image/webp;base64,AAAA' },
        video: null,
      });
    });

    it('still accepts a photo it couldn’t make a preview for', async () => {
      const ctx = setup();
      ctx.previews.result = null;
      const ticket = await upload(ctx);
      await expect(ctx.service.complete('u1', ticket.mediaId)).resolves.toMatchObject({ id: ticket.mediaId });
      expect(ctx.repo.rows.get(ticket.mediaId)).toMatchObject({ status: 'READY', photo: null });
    });

    it('doesn’t make previews for avatars', async () => {
      const ctx = setup();
      const ticket = await upload(ctx, JPEG, 2000, 'image/jpeg', 'AVATAR');
      await ctx.service.complete('u1', ticket.mediaId);
      expect(ctx.previews.seen).toEqual([]);
      expect(ctx.repo.rows.get(ticket.mediaId)).toMatchObject({ status: 'READY', photo: null });
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

  describe('videos', () => {
    const probe = new MediaInfoVideoProbe();
    afterAll(() => probe.onModuleDestroy());
    const fixture = (name: string) => new Uint8Array(readFileSync(`test/fixtures/videos/${name}`));

    function videoSetup() {
      const repo = new InMemoryMediaRepository();
      const storage = new FakeObjectStorage();
      return { repo, storage, service: new MediaService(repo, storage, probe, new FakePhotoPreviewer()) };
    }

    async function uploadVideo(ctx: ReturnType<typeof videoSetup>, bytes: Uint8Array, contentType = 'video/mp4') {
      const ticket = await ctx.service.createUpload('u1', {
        purpose: 'POST_VIDEO',
        contentType,
        sizeBytes: bytes.length,
      });
      ctx.storage.put(ctx.storage.presigned.at(-1)!.key, bytes);
      return ticket;
    }

    it('takes MP4, MOV and WebM up to 512 MB, with an hour to upload', async () => {
      const ctx = videoSetup();
      const ticket = await ctx.service.createUpload('u1', {
        purpose: 'POST_VIDEO',
        contentType: 'video/quicktime',
        sizeBytes: 400 * MB,
      });
      expect(ctx.storage.presigned.at(-1)).toMatchObject({ contentType: 'video/quicktime', maxBytes: 512 * MB });
      expect(ctx.storage.presigned.at(-1)!.key).toMatch(/^post_video\/u1\/.+\.mov$/);
      expect(ticket.expiresAt.getTime() - Date.now()).toBeGreaterThan(55 * 60_000);
      await expect(
        ctx.service.createUpload('u1', { purpose: 'POST_VIDEO', contentType: 'video/x-msvideo', sizeBytes: 100 }),
      ).rejects.toThrow('Only MP4, WebM or MOV videos can be uploaded.');
      await expect(
        ctx.service.createUpload('u1', { purpose: 'POST_VIDEO', contentType: 'video/mp4', sizeBytes: 513 * MB }),
      ).rejects.toThrow('Videos can be up to 512 MB.');
      await expect(
        ctx.service.createUpload('u1', { purpose: 'POST_PHOTO', contentType: 'video/mp4', sizeBytes: 100 }),
      ).rejects.toThrow('Only JPEG, PNG or WebP photos can be uploaded.');
    });

    it('verifies a real video, reading its length and size from the file', async () => {
      const ctx = videoSetup();
      for (const [name, type] of [
        ['short.mp4', 'video/mp4'],
        ['short.mov', 'video/quicktime'],
        ['short.webm', 'video/webm'],
      ] as const) {
        const ticket = await uploadVideo(ctx, fixture(name), type);
        await expect(ctx.service.complete('u1', ticket.mediaId), name).resolves.toMatchObject({
          contentType: type,
          video: { durationSeconds: 2, width: 32, height: 18 },
        });
      }
      const ticket = await uploadVideo(ctx, fixture('short.mp4'));
      await ctx.service.complete('u1', ticket.mediaId);
      await expect(ctx.service.claim('u1', [ticket.mediaId], 'POST_VIDEO')).resolves.toMatchObject([
        { id: ticket.mediaId, video: { durationSeconds: 2 } },
      ]);
    });

    it('refuses videos over 10 minutes, and files that aren’t really videos, deleting them', async () => {
      const ctx = videoSetup();
      const long = await uploadVideo(ctx, fixture('eleven-minutes.mp4'));
      await expect(ctx.service.complete('u1', long.mediaId)).rejects.toThrow('Videos can be up to 10 minutes long.');
      const fake = await uploadVideo(ctx, HTML);
      await expect(ctx.service.complete('u1', fake.mediaId)).rejects.toThrow('That file isn’t a video we can play');
      const mislabelled = await uploadVideo(ctx, fixture('short.webm'), 'video/mp4');
      await expect(ctx.service.complete('u1', mislabelled.mediaId)).rejects.toBeInstanceOf(InvalidUploadError);
      expect(ctx.storage.deleted).toHaveLength(3);
      await expect(ctx.service.claim('u1', [long.mediaId], 'POST_VIDEO')).rejects.toThrow(
        'That video is missing or still uploading.',
      );
    });
  });
});
