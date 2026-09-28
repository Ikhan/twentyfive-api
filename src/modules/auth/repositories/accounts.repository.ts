import type { OAuthProvider } from '../../../generated/prisma/enums.js';

/** The signed-in user as auth sees them. The users feature owns the full profile. */
export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  hometownId: string | null;
  onboarded: boolean;
}

export interface NewAccountUser {
  username: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  provider: OAuthProvider;
  providerAccountId: string;
}

/** Persistence for users and their linked provider logins, as needed by sign-in. */
export interface AccountsRepository {
  findUserByAccount(provider: OAuthProvider, providerAccountId: string): Promise<SessionUser | null>;
  findUserById(id: string): Promise<SessionUser | null>;
  usernameExists(username: string): Promise<boolean>;
  /** Creates the user and their first linked account atomically. */
  createUserWithAccount(input: NewAccountUser): Promise<SessionUser>;
}

export const ACCOUNTS_REPOSITORY = Symbol('ACCOUNTS_REPOSITORY');
