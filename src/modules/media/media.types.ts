export type MediaPurpose = 'POST_PHOTO' | 'AVATAR' | 'HEADER';
export type MediaStatus = 'PENDING' | 'READY';

export interface MediaRecord {
  id: string;
  ownerId: string;
  purpose: MediaPurpose;
  status: MediaStatus;
  key: string;
  contentType: string;
  sizeBytes: number | null;
}

/** A verified photo, as returned to clients and attached to posts or avatars. */
export interface MediaView {
  id: string;
  url: string;
  contentType: string;
  sizeBytes: number;
}

export interface UploadTicket {
  mediaId: string;
  upload: { url: string; fields: Record<string, string> };
  expiresAt: Date;
  maxBytes: number;
}
