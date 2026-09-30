import type { MyProfile, ProfileChanges, UserSummary } from './users.types.js';

export interface UsersRepository {
  findById(id: string): Promise<MyProfile | null>;
  findByUsername(username: string): Promise<MyProfile | null>;
  /** True when another user (not `exceptUserId`) already has this username. */
  usernameTaken(username: string, exceptUserId?: string): Promise<boolean>;
  districtExists(districtId: string): Promise<boolean>;
  /**
   * People whose username, or any word of their name, starts with `prefix` (lowercase, may be empty),
   * for @mentions. Onboarded, not the viewer, no block either way. People you follow first, then username
   * matches, then more followers.
   */
  search(viewerId: string, prefix: string, take: number): Promise<UserSummary[]>;
  /** Applies changes; `completeOnboarding` also stamps onboardedAt. Throws UsernameTakenError on a race. */
  update(userId: string, changes: ProfileChanges, options?: { completeOnboarding?: boolean }): Promise<MyProfile>;
}

export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');
