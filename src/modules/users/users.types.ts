export interface DistrictRef {
  id: string;
  name: string;
}

/** What anyone can see about a user. Never includes email. */
export interface PublicProfile {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  hometown: DistrictRef | null;
  isPrivate: boolean;
  joinedAt: Date;
}

/** The signed-in user's own profile. */
export interface MyProfile extends PublicProfile {
  onboarded: boolean;
}

export interface ProfileChanges {
  displayName?: string;
  username?: string;
  bio?: string;
  hometownId?: string;
  isPrivate?: boolean;
}
