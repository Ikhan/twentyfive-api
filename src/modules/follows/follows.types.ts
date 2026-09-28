import type { DistrictRef, UserSummary } from '../users/users.types.js';

/** How the viewer relates to a profile. */
export type Relationship = 'self' | 'none' | 'requested' | 'following';

export interface FollowStats {
  followers: number;
  following: number;
  relationship: Relationship;
  /** They follow you (accepted). Useful for "Follows you" badges. */
  followsYou: boolean;
}

export interface FollowTarget {
  id: string;
  username: string;
  isPrivate: boolean;
}

export type FollowStatus = 'PENDING' | 'ACCEPTED';

/** A "People to follow" candidate with the signals it was scored on, best first. */
export interface SuggestionRow extends UserSummary {
  followsYou: boolean;
  /** How many people you follow follow them (public accounts only), and up to two of their usernames. */
  mutualCount: number;
  mutualUsernames: string[];
  hometown: DistrictRef | null;
  sameHometown: boolean;
  /** Their hometown is a district you follow. */
  fromFollowedDistrict: boolean;
}

/** Why someone is suggested, most convincing first. `null`: popular or new, nothing personal. */
export type SuggestionReason =
  | { kind: 'follows-you' }
  | { kind: 'followed-by'; usernames: string[]; count: number }
  | { kind: 'hometown'; district: DistrictRef }
  | { kind: 'followed-district'; district: DistrictRef }
  | null;

export interface SuggestedUser extends UserSummary {
  reason: SuggestionReason;
}
