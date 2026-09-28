import type { UserSummary } from '../users/users.types.js';

export type PostAudience = 'EVERYONE' | 'FOLLOWERS';

export interface PostDistrict {
  id: string;
  name: string;
  colors: [string, string];
}

export interface PostPhotoView {
  id: string;
  url: string;
}

export interface PostView {
  id: string;
  body: string;
  audience: PostAudience;
  createdAt: Date;
  author: UserSummary;
  district: PostDistrict;
  photos: PostPhotoView[];
}

/** Which posts a list should contain; visibility rules are always applied on top. */
export type PostScope =
  | { kind: 'everything' }
  | { kind: 'following' }
  | { kind: 'district'; districtId: string }
  | { kind: 'author'; authorId: string };

export interface NewPost {
  authorId: string;
  districtId: string;
  body: string;
  audience: PostAudience;
  photos: { mediaId: string; url: string }[];
}

export interface PostCursor {
  /** createdAt as ISO string */
  t: string;
  id: string;
}
