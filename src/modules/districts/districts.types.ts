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
}

export interface DistrictDetail extends DistrictSummary, FollowState {
  description: string;
  famousFor: string[];
}
