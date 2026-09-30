import type { MediaPurpose, MediaRecord } from './media.types.js';
import type { VideoDetails } from './video-probe.js';

export interface MediaRepository {
  create(media: Omit<MediaRecord, 'status' | 'sizeBytes' | 'video'>): Promise<MediaRecord>;
  findById(id: string): Promise<MediaRecord | null>;
  /** Verified: its real size, and for videos their length and picture size. */
  markReady(id: string, sizeBytes: number, video?: VideoDetails | null): Promise<MediaRecord>;
  /** READY media with these ids that belong to `ownerId`, have this purpose and aren't attached to a post yet. */
  findReady(ownerId: string, ids: string[], purpose: MediaPurpose): Promise<MediaRecord[]>;
}

export const MEDIA_REPOSITORY = Symbol('MEDIA_REPOSITORY');
