import type { Province } from '../../generated/prisma/enums.js';
import type { UserSummary } from '../users/users.types.js';
import type { DistrictRow } from './districts.types.js';

export interface DistrictsRepository {
  /** All districts (optionally one province), A–Z. */
  list(province?: Province): Promise<DistrictRow[]>;
  findById(id: string): Promise<DistrictRow | null>;
  followerCount(districtId: string): Promise<number>;
  isFollowing(userId: string, districtId: string): Promise<boolean>;
  /** Idempotent. */
  follow(userId: string, districtId: string): Promise<void>;
  /** Idempotent. */
  unfollow(userId: string, districtId: string): Promise<void>;
  /** People whose hometown is this district, ordered by username, after `afterUsername`. */
  residents(districtId: string, options: { afterUsername?: string; take: number }): Promise<UserSummary[]>;
}

export const DISTRICTS_REPOSITORY = Symbol('DISTRICTS_REPOSITORY');
