import type { MediaPurpose, MediaRecord } from './media.types.js';

export interface MediaRepository {
  create(media: Omit<MediaRecord, 'status' | 'sizeBytes'>): Promise<MediaRecord>;
  findById(id: string): Promise<MediaRecord | null>;
  markReady(id: string, sizeBytes: number): Promise<MediaRecord>;
  /** READY media with these ids that belong to `ownerId`, have this purpose and aren't attached to a post yet. */
  findReady(ownerId: string, ids: string[], purpose: MediaPurpose): Promise<MediaRecord[]>;
}

export const MEDIA_REPOSITORY = Symbol('MEDIA_REPOSITORY');
