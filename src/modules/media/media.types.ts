import type { VideoDetails } from './video-probe.js';

export type MediaPurpose = 'POST_PHOTO' | 'AVATAR' | 'HEADER' | 'POST_VIDEO';
export type MediaStatus = 'PENDING' | 'READY';

export interface MediaRecord {
  id: string;
  ownerId: string;
  purpose: MediaPurpose;
  status: MediaStatus;
  key: string;
  contentType: string;
  sizeBytes: number | null;
  /** Videos: length and picture size, once verified. */
  video: VideoDetails | null;
}

/** A verified photo or video, as returned to clients and attached to posts or avatars. */
export interface MediaView {
  id: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  /** Videos only. */
  video: VideoDetails | null;
}

export interface UploadTicket {
  mediaId: string;
  upload: { url: string; fields: Record<string, string> };
  expiresAt: Date;
  maxBytes: number;
}
