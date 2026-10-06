import type { Province } from '../../generated/prisma/enums.js';

export interface DistrictRow {
  id: string;
  name: string;
  nameSi: string;
  nameTa: string;
  province: Province;
  tagline: string;
  description: string;
  famousFor: string[];
  colorFrom: string;
  colorTo: string;
}

export interface DistrictSummary {
  id: string;
  name: string;
  nameSi: string;
  nameTa: string;
  province: { id: Province; name: string };
  tagline: string;
  /** Gradient used when a district has no photo. */
  colors: [string, string];
}

export interface FollowState {
  followerCount: number;
  followedByMe: boolean;
  /** The viewer's bell: they're told about new posts here. Only ever true while followedByMe. */
  notifying: boolean;
}

export interface DistrictDetail extends DistrictSummary, FollowState {
  description: string;
  famousFor: string[];
}

/** A district in the Explore list: its summary plus follower count and whether you follow it. */
export type DistrictListItem = DistrictSummary & FollowState;

/** A district's public activity since some time: its post count and a weighted, time-decayed score. */
export interface DistrictActivity {
  districtId: string;
  posts: number;
  score: number;
}

/** Why a district is in Trending: busy today, busy this week, or (no recent activity) most followed. */
export type TrendingWindow = 'day' | 'week';

export interface TrendingDistrict extends DistrictSummary {
  followerCount: number;
  /** Posts in `window` (0 when the district is only there for its followers). */
  postCount: number;
  window: TrendingWindow | null;
}
