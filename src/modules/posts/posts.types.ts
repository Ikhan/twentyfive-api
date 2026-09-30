import type { LinkPreview } from '../links/link-preview.types.js';
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

/** A post's video: where to play it from, its length, and its picture size (for the player's shape). */
export interface PostVideoView {
  id: string;
  url: string;
  durationSeconds: number;
  width: number;
  height: number;
}

/** A post as stored and filtered by the repository. */
export interface PostRecord {
  id: string;
  body: string;
  audience: PostAudience;
  createdAt: Date;
  author: UserSummary;
  /** Null for posts to all districts. */
  district: PostDistrict | null;
  photos: PostPhotoView[];
  /** At most one, and never with photos. */
  video: PostVideoView | null;
  counts: PostCounts;
  /** The signed-in viewer's own reactions. */
  viewer: PostViewerState;
  /** For quote posts, the quoted post (one level deep); null for ordinary posts. */
  quoted: QuotedPost | null;
  /** The card for the first link in the post, if it had one (not with photos). */
  link: LinkPreview | null;
}

/** A post as the API returns it. */
export interface PostView extends PostRecord {
  /** @handles in the post (or the post it quotes) that belong to real accounts, lowercase: link these. */
  mentions: string[];
}

/** The post inside a quote: its content, or unavailable if it was deleted or the viewer can't see it. */
export type QuotedPost =
  | { available: false }
  | {
      available: true;
      id: string;
      body: string;
      createdAt: Date;
      author: UserSummary;
      district: PostDistrict | null;
      photos: PostPhotoView[];
    };

export interface PostCounts {
  comments: number;
  likes: number;
  reposts: number;
  quotes: number;
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
  /** A verified POST_VIDEO upload (never with photos). */
  video?: { mediaId: string; url: string; durationSeconds: number; width: number; height: number } | null;
  /** Set for quote posts: the post being quoted. */
  quotedPostId?: string | null;
  /** The card for its first link, if there is one. */
  link?: LinkPreview | null;
}

export interface PostCursor {
  /** createdAt as ISO string */
  t: string;
  id: string;
}
