export interface DistrictRef {
  id: string;
  name: string;
}

/** A user in a list (people from a district, followers, post authors). */
export interface UserSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isPrivate: boolean;
}

/** What anyone can see about a user. Never includes email. */
export interface PublicProfile {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  /** Custom profile banner; null means "show the hometown photo". */
  headerUrl: string | null;
  hometown: DistrictRef | null;
  isPrivate: boolean;
  joinedAt: Date;
}

/** The signed-in user's own profile. */
export interface MyProfile extends PublicProfile {
  onboarded: boolean;
}

export interface ProfileChanges {
  /** Set via PUT/DELETE /users/me/avatar only (from a verified upload). */
  avatarUrl?: string | null;
  /** Set via PUT/DELETE /users/me/header only (from a verified upload). */
  headerUrl?: string | null;
  displayName?: string;
  username?: string;
  bio?: string;
  hometownId?: string;
  isPrivate?: boolean;
}
