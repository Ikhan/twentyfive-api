import type { UsersRepository } from '../../src/modules/users/users.repository.js';
import type { MyProfile, ProfileChanges, UserSummary } from '../../src/modules/users/users.types.js';

const DISTRICTS: Record<string, string> = { kandy: 'Kandy', galle: 'Galle', badulla: 'Badulla' };

export function profile(overrides: Partial<MyProfile> = {}): MyProfile {
  return {
    id: 'u-kasun',
    username: 'kasunperera',
    displayName: 'Kasun Perera',
    bio: '',
    avatarUrl: null,
    headerUrl: null,
    hometown: null,
    isPrivate: false,
    onboarded: false,
    joinedAt: new Date('2026-08-01'),
    ...overrides,
  };
}

export class InMemoryUsersRepository implements UsersRepository {
  readonly users = new Map<string, MyProfile>();

  constructor(...initial: MyProfile[]) {
    for (const user of initial) this.users.set(user.id, user);
  }

  async findById(id: string): Promise<MyProfile | null> {
    return this.users.get(id) ?? null;
  }

  async findByUsername(username: string): Promise<MyProfile | null> {
    return [...this.users.values()].find((u) => u.username === username) ?? null;
  }

  /** Matching only (ordering by follows and followers is SQL, covered by the integration tests). */
  async search(viewerId: string, prefix: string, take: number): Promise<UserSummary[]> {
    return [...this.users.values()]
      .filter((u) => u.id !== viewerId && u.onboarded)
      .filter(
        (u) =>
          u.username.startsWith(prefix) ||
          u.displayName
            .toLowerCase()
            .split(' ')
            .some((w) => w.startsWith(prefix)),
      )
      .slice(0, take)
      .map(({ id, username, displayName, avatarUrl, isPrivate }) => ({
        id,
        username,
        displayName,
        avatarUrl,
        isPrivate,
      }));
  }

  async usernameTaken(username: string, exceptUserId?: string): Promise<boolean> {
    return [...this.users.values()].some((u) => u.username === username && u.id !== exceptUserId);
  }

  async districtExists(districtId: string): Promise<boolean> {
    return districtId in DISTRICTS;
  }

  async update(
    userId: string,
    { hometownId, ...changes }: ProfileChanges,
    options: { completeOnboarding?: boolean } = {},
  ): Promise<MyProfile> {
    const current = this.users.get(userId)!;
    const next: MyProfile = {
      ...current,
      ...changes,
      ...(hometownId && { hometown: { id: hometownId, name: DISTRICTS[hometownId]! } }),
      ...(options.completeOnboarding && { onboarded: true }),
    };
    this.users.set(userId, next);
    return next;
  }
}
