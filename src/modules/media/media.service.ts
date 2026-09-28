import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InvalidUploadError, MediaNotFoundError } from './media.errors.js';
import { MEDIA_REPOSITORY, type MediaRepository } from './media.repository.js';
import type { MediaPurpose, MediaRecord, MediaView, UploadTicket } from './media.types.js';
import { ALLOWED_IMAGE_TYPES, detectImageType, EXTENSION, SIGNATURE_BYTES, type ImageType } from './image-signature.js';
import { OBJECT_STORAGE, type ObjectStorage } from './storage/object-storage.js';

const MB = 1024 * 1024;
export const MAX_BYTES: Record<MediaPurpose, number> = { POST_PHOTO: 10 * MB, AVATAR: 5 * MB };
const UPLOAD_TTL_SECONDS = 5 * 60;

@Injectable()
export class MediaService {
  constructor(
    @Inject(MEDIA_REPOSITORY) private readonly media: MediaRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /** Step 1: reserve a photo and hand the browser a short-lived, locked-down upload form. */
  async createUpload(
    ownerId: string,
    input: { purpose: MediaPurpose; contentType: string; sizeBytes: number },
  ): Promise<UploadTicket> {
    if (!isAllowed(input.contentType))
      throw new InvalidUploadError('Only JPEG, PNG or WebP photos can be uploaded.', { field: 'contentType' });
    const maxBytes = MAX_BYTES[input.purpose];
    if (input.sizeBytes > maxBytes)
      throw new InvalidUploadError(`Photos can be up to ${maxBytes / MB} MB.`, { field: 'sizeBytes' });

    const id = randomUUID();
    const key = `${input.purpose.toLowerCase()}/${ownerId}/${id}.${EXTENSION[input.contentType]}`;
    const upload = await this.storage.presignUpload({
      key,
      contentType: input.contentType,
      maxBytes,
      expiresInSeconds: UPLOAD_TTL_SECONDS,
    });
    await this.media.create({ id, ownerId, purpose: input.purpose, key, contentType: input.contentType });
    return { mediaId: id, upload, expiresAt: new Date(Date.now() + UPLOAD_TTL_SECONDS * 1000), maxBytes };
  }

  /** Step 3: confirm the upload landed, is within limits and really is the image type claimed. Idempotent. */
  async complete(ownerId: string, mediaId: string): Promise<MediaView> {
    const media = await this.media.findById(mediaId);
    if (!media || media.ownerId !== ownerId) throw new MediaNotFoundError();
    if (media.status === 'READY') return this.view(media);

    const info = await this.storage.stat(media.key);
    if (!info) throw new InvalidUploadError('The photo hasn’t finished uploading yet.');
    if (info.sizeBytes > MAX_BYTES[media.purpose]) return this.reject(media, 'The photo is too large.');
    const actual = detectImageType(await this.storage.readPrefix(media.key, SIGNATURE_BYTES));
    if (actual !== media.contentType) return this.reject(media, 'That file isn’t a valid JPEG, PNG or WebP photo.');

    return this.view(await this.media.markReady(media.id, info.sizeBytes));
  }

  /**
   * For posts and avatars: returns the caller's READY photos with these ids, in the order given.
   * Throws if any id is unknown, not theirs, not verified, or for another purpose.
   */
  async claim(ownerId: string, ids: string[], purpose: MediaPurpose): Promise<MediaView[]> {
    const unique = [...new Set(ids)];
    const found = await this.media.findReady(ownerId, unique, purpose);
    if (found.length !== unique.length)
      throw new InvalidUploadError('Some photos are missing or still uploading.', { field: 'mediaIds' });
    const byId = new Map(found.map((m) => [m.id, m]));
    return unique.map((id) => this.view(byId.get(id)!));
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
    };
  }
}

function isAllowed(contentType: string): contentType is ImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(contentType);
}
