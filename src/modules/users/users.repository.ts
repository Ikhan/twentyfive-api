import type { MyProfile, ProfileChanges } from './users.types.js';

export interface UsersRepository {
  findById(id: string): Promise<MyProfile | null>;
  findByUsername(username: string): Promise<MyProfile | null>;
  /** True when another user (not `exceptUserId`) already has this username. */
  usernameTaken(username: string, exceptUserId?: string): Promise<boolean>;
  districtExists(districtId: string): Promise<boolean>;
  /** Applies changes; `completeOnboarding` also stamps onboardedAt. Throws UsernameTakenError on a race. */
  update(userId: string, changes: ProfileChanges, options?: { completeOnboarding?: boolean }): Promise<MyProfile>;
}

export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');
