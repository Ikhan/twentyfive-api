export interface SessionRecord {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface NewSession {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string;
}

/** Persistence for refresh-token sessions. */
export interface SessionsRepository {
  create(session: NewSession): Promise<SessionRecord>;
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  /** Revokes `oldId` and creates `next` in one transaction. */
  rotate(oldId: string, next: NewSession): Promise<SessionRecord>;
  revoke(id: string): Promise<void>;
  /** Revokes every session in a sign-in family (used when a stolen token is detected). */
  revokeFamily(familyId: string): Promise<void>;
}

export const SESSIONS_REPOSITORY = Symbol('SESSIONS_REPOSITORY');
