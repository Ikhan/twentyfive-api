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
