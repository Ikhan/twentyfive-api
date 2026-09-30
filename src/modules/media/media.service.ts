import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InvalidUploadError, MediaNotFoundError } from './media.errors.js';
import { MEDIA_REPOSITORY, type MediaRepository } from './media.repository.js';
import type { MediaPurpose, MediaRecord, MediaView, UploadTicket } from './media.types.js';
import { ALLOWED_IMAGE_TYPES, detectImageType, EXTENSION, SIGNATURE_BYTES, type ImageType } from './image-signature.js';
import { OBJECT_STORAGE, type ObjectStorage } from './storage/object-storage.js';
import { VIDEO_PROBE, type VideoDetails, type VideoProbe } from './video-probe.js';
import { ALLOWED_VIDEO_TYPES, isVideoOfType, VIDEO_EXTENSION, type VideoType } from './video-signature.js';

const MB = 1024 * 1024;
export const MAX_BYTES: Record<MediaPurpose, number> = {
  POST_PHOTO: 10 * MB,
  AVATAR: 5 * MB,
  HEADER: 10 * MB,
  POST_VIDEO: 512 * MB,
};
/** Videos in posts can be up to 10 minutes long. */
export const MAX_VIDEO_SECONDS = 10 * 60;
/** Videos are big, so their upload form lasts longer. */
const UPLOAD_TTL_SECONDS: Record<'photo' | 'video', number> = { photo: 5 * 60, video: 60 * 60 };

const isVideoPurpose = (purpose: MediaPurpose) => purpose === 'POST_VIDEO';

@Injectable()
export class MediaService {
  constructor(
    @Inject(MEDIA_REPOSITORY) private readonly media: MediaRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(VIDEO_PROBE) private readonly videos: VideoProbe,
  ) {}

  /** Step 1: reserve a photo or video and hand the browser a short-lived, locked-down upload form. */
  async createUpload(
    ownerId: string,
    input: { purpose: MediaPurpose; contentType: string; sizeBytes: number },
  ): Promise<UploadTicket> {
    const video = isVideoPurpose(input.purpose);
    const extension = video ? videoExtension(input.contentType) : imageExtension(input.contentType);
    if (!extension)
      throw new InvalidUploadError(
        video ? 'Only MP4, WebM or MOV videos can be uploaded.' : 'Only JPEG, PNG or WebP photos can be uploaded.',
        { field: 'contentType' },
      );
    const maxBytes = MAX_BYTES[input.purpose];
    if (input.sizeBytes > maxBytes)
      throw new InvalidUploadError(`${video ? 'Videos' : 'Photos'} can be up to ${maxBytes / MB} MB.`, {
        field: 'sizeBytes',
      });

    const id = randomUUID();
    const key = `${input.purpose.toLowerCase()}/${ownerId}/${id}.${extension}`;
    const ttl = UPLOAD_TTL_SECONDS[video ? 'video' : 'photo'];
    const upload = await this.storage.presignUpload({
      key,
      contentType: input.contentType,
      maxBytes,
      expiresInSeconds: ttl,
    });
    await this.media.create({ id, ownerId, purpose: input.purpose, key, contentType: input.contentType });
    return { mediaId: id, upload, expiresAt: new Date(Date.now() + ttl * 1000), maxBytes };
  }

  /**
   * Step 3: confirm the upload landed, is within limits and really is the type claimed. For videos, also
   * read their length from the file (at most 10 minutes) and picture size. Idempotent.
   */
  async complete(ownerId: string, mediaId: string): Promise<MediaView> {
    const media = await this.media.findById(mediaId);
    if (!media || media.ownerId !== ownerId) throw new MediaNotFoundError();
    if (media.status === 'READY') return this.view(media);
    const video = isVideoPurpose(media.purpose);
    const noun = video ? 'video' : 'photo';

    const info = await this.storage.stat(media.key);
    if (!info) throw new InvalidUploadError(`The ${noun} hasn’t finished uploading yet.`);
    if (info.sizeBytes > MAX_BYTES[media.purpose]) return this.reject(media, `The ${noun} is too large.`);
    const prefix = await this.storage.readPrefix(media.key, SIGNATURE_BYTES);

    if (!video) {
      if (detectImageType(prefix) !== media.contentType)
        return this.reject(media, 'That file isn’t a valid JPEG, PNG or WebP photo.');
      return this.view(await this.media.markReady(media.id, info.sizeBytes));
    }

    const details = isVideoOfType(prefix, media.contentType as VideoType)
      ? await this.probe(media, info.sizeBytes)
      : null;
    if (!details) return this.reject(media, 'That file isn’t a video we can play (MP4, WebM or MOV).');
    if (details.durationSeconds > MAX_VIDEO_SECONDS) return this.reject(media, 'Videos can be up to 10 minutes long.');
    return this.view(await this.media.markReady(media.id, info.sizeBytes, details));
  }

  /**
   * For posts and avatars: returns the caller's READY uploads with these ids, in the order given.
   * Throws if any id is unknown, not theirs, not verified, or for another purpose.
   */
  async claim(ownerId: string, ids: string[], purpose: MediaPurpose): Promise<MediaView[]> {
    const unique = [...new Set(ids)];
    const found = await this.media.findReady(ownerId, unique, purpose);
    if (found.length !== unique.length)
      throw new InvalidUploadError(
        isVideoPurpose(purpose)
          ? 'That video is missing or still uploading.'
          : 'Some photos are missing or still uploading.',
        { field: isVideoPurpose(purpose) ? 'videoId' : 'mediaIds' },
      );
    const byId = new Map(found.map((m) => [m.id, m]));
    return unique.map((id) => this.view(byId.get(id)!));
  }

  private async probe(media: MediaRecord, sizeBytes: number): Promise<VideoDetails | null> {
    try {
      return await this.videos.probe(sizeBytes, (offset, length) => this.storage.readRange(media.key, offset, length));
    } catch {
      return null;
    }
  }

  private async reject(media: MediaRecord, message: string): Promise<never> {
    await this.storage.delete(media.key);
    throw new InvalidUploadError(message);
  }

  private view(media: MediaRecord): MediaView {
    return {
      id: media.id,
      url: this.storage.publicUrl(media.key),
      contentType: media.contentType,
      sizeBytes: media.sizeBytes ?? 0,
      video: media.video,
    };
  }
}

function imageExtension(contentType: string): string | null {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(contentType) ? EXTENSION[contentType as ImageType] : null;
}

function videoExtension(contentType: string): string | null {
  return (ALLOWED_VIDEO_TYPES as readonly string[]).includes(contentType)
    ? VIDEO_EXTENSION[contentType as VideoType]
    : null;
}
