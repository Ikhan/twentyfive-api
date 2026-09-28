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
  /** Null for posts to all districts. */
  district: PostDistrict | null;
  photos: PostPhotoView[];
  counts: PostCounts;
  /** The signed-in viewer's own reactions. */
  viewer: PostViewerState;
}

export interface PostCounts {
  comments: number;
  likes: number;
  reposts: number;
}

export interface PostViewerState {
  liked: boolean;
  reposted: boolean;
}

/** Which posts a list should contain; visibility rules are always applied on top. */
export type PostScope =
  | { kind: 'everything' }
  | { kind: 'following' }
  | { kind: 'district'; districtId: string }
  | { kind: 'author'; authorId: string };

export interface NewPost {
  authorId: string;
  /** Null: about all districts, shown on no district page. */
  districtId: string | null;
  body: string;
  audience: PostAudience;
  photos: { mediaId: string; url: string }[];
}

export interface PostCursor {
  /** createdAt as ISO string */
  t: string;
  id: string;
}
