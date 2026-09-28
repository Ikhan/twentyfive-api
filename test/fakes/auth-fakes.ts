import { randomUUID } from 'node:crypto';
import { OAuthProvider as ProviderEnum } from '../../src/generated/prisma/enums.js';
import type { OAuthProfile, OAuthProvider } from '../../src/modules/auth/oauth/oauth-provider.js';
import type {
  AccountsRepository,
  NewAccountUser,
  SessionUser,
} from '../../src/modules/auth/repositories/accounts.repository.js';
import type {
  NewSession,
  SessionRecord,
  SessionsRepository,
} from '../../src/modules/auth/repositories/sessions.repository.js';

/** Stands in for Google in tests: any code maps to the profile you give it. */
export class FakeOAuthProvider implements OAuthProvider {
  readonly id = 'google' as const;
  readonly label = 'Google';
  readonly dbProvider = ProviderEnum.GOOGLE;
  profile: OAuthProfile = { providerAccountId: 'g-kasun', displayName: 'Kasun Perera', email: 'kasun@example.lk' };
  lastExchange?: { code: string; codeVerifier: string; redirectUri: string };

  authorizationUrl({
    state,
    codeChallenge,
    redirectUri,
  }: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
  }): string {
    return `https://fake-oauth.test/authorize?${new URLSearchParams({ state, code_challenge: codeChallenge, redirect_uri: redirectUri })}`;
  }

  async fetchProfile(exchange: { code: string; codeVerifier: string; redirectUri: string }): Promise<OAuthProfile> {
    this.lastExchange = exchange;
    if (exchange.code === 'bad-code') throw new Error('invalid_grant');
    return this.profile;
  }
}

export class InMemoryAccountsRepository implements AccountsRepository {
  readonly users = new Map<string, SessionUser>();
  readonly accounts = new Map<string, string>(); // `${provider}:${id}` → userId
  takenUsernames = new Set<string>();

  async findUserByAccount(provider: ProviderEnum, providerAccountId: string): Promise<SessionUser | null> {
    const userId = this.accounts.get(`${provider}:${providerAccountId}`);
    return userId ? (this.users.get(userId) ?? null) : null;
  }

  async findUserById(id: string): Promise<SessionUser | null> {
    return this.users.get(id) ?? null;
  }

  async usernameExists(username: string): Promise<boolean> {
    return this.takenUsernames.has(username) || [...this.users.values()].some((u) => u.username === username);
  }

  async createUserWithAccount(input: NewAccountUser): Promise<SessionUser> {
    const user: SessionUser = {
      id: randomUUID(),
      username: input.username,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl ?? null,
      hometownId: null,
      onboarded: false,
    };
    this.users.set(user.id, user);
    this.accounts.set(`${input.provider}:${input.providerAccountId}`, user.id);
    return user;
  }
}

export class InMemorySessionsRepository implements SessionsRepository {
  readonly sessions: (SessionRecord & { tokenHash: string })[] = [];

  async create(s: NewSession): Promise<SessionRecord> {
    const record = {
      id: randomUUID(),
      userId: s.userId,
      familyId: s.familyId,
      expiresAt: s.expiresAt,
      revokedAt: null,
      tokenHash: s.tokenHash,
    };
    this.sessions.push(record);
    return record;
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    return this.sessions.find((s) => s.tokenHash === tokenHash) ?? null;
  }

  async rotate(oldId: string, next: NewSession): Promise<SessionRecord> {
    await this.revoke(oldId);
    return this.create(next);
  }

  async revoke(id: string): Promise<void> {
    const s = this.sessions.find((x) => x.id === id);
    if (s && !s.revokedAt) s.revokedAt = new Date();
  }

  async revokeFamily(familyId: string): Promise<void> {
    for (const s of this.sessions) if (s.familyId === familyId && !s.revokedAt) s.revokedAt = new Date();
  }

  active(): SessionRecord[] {
    return this.sessions.filter((s) => !s.revokedAt);
  }
}
