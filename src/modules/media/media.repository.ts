import type { MediaPurpose, MediaRecord } from './media.types.js';
import type { PhotoPreview } from './photo-preview.js';
import type { VideoDetails } from './video-probe.js';

export interface MediaRepository {
  create(media: Omit<MediaRecord, 'status' | 'sizeBytes' | 'video' | 'photo'>): Promise<MediaRecord>;
  findById(id: string): Promise<MediaRecord | null>;
  /** Verified: its real size, plus for videos their length and picture size, or for photos their preview. */
  markReady(id: string, sizeBytes: number, details?: VideoDetails | PhotoPreview | null): Promise<MediaRecord>;
  /** READY media with these ids that belong to `ownerId`, have this purpose and aren't attached to a post yet. */
  findReady(ownerId: string, ids: string[], purpose: MediaPurpose): Promise<MediaRecord[]>;
}

export const MEDIA_REPOSITORY = Symbol('MEDIA_REPOSITORY');
