import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent, type UserPrivacyChangedEvent } from '../../common/events/domain-events.js';
import { NotFoundError } from '../../common/errors/app-error.js';
import { usernameProblem } from '../../common/validation/username.js';
import { UnknownDistrictError, UsernameNotAllowedError, UsernameTakenError } from './users.errors.js';
import { USERS_REPOSITORY, type UsersRepository } from './users.repository.js';
import type { MyProfile, ProfileChanges, PublicProfile } from './users.types.js';

export type UsernameAvailability = { available: true } | { available: false; reason: 'invalid' | 'reserved' | 'taken' };

@Injectable()
export class UsersService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    private readonly events: EventEmitter2,
  ) {}

  async me(userId: string): Promise<MyProfile> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError('Account not found.');
    return user;
  }

  /** Public view of any user. Private accounts still show their profile header; their posts are filtered elsewhere. */
  async byUsername(username: string): Promise<PublicProfile> {
    const user = await this.users.findByUsername(username.toLowerCase());
    if (!user) throw new NotFoundError(`@${username} doesn’t exist.`);
    return toPublic(user);
  }

  async usernameAvailability(username: string, userId: string): Promise<UsernameAvailability> {
    const problem = usernameProblem(username);
    if (problem) return { available: false, reason: problem };
    if (await this.users.usernameTaken(username, userId)) return { available: false, reason: 'taken' };
    return { available: true };
  }

  async updateProfile(userId: string, changes: ProfileChanges): Promise<MyProfile> {
    const before = await this.me(userId);
    await this.assertValid(userId, changes);
    const after = await this.users.update(userId, changes);
    if (after.isPrivate !== before.isPrivate) {
      // e.g. going public approves pending follow requests (see FollowsListener).
      await this.events.emitAsync(DomainEvent.UserPrivacyChanged, {
        userId,
        isPrivate: after.isPrivate,
      } satisfies UserPrivacyChangedEvent);
    }
    return after;
  }

  /** Finishes onboarding. Allowed again later (it only updates fields), so a retry after a network error is safe. */
  async completeOnboarding(
    userId: string,
    changes: Required<Pick<ProfileChanges, 'displayName' | 'username' | 'hometownId'>> & ProfileChanges,
  ): Promise<MyProfile> {
    await this.me(userId);
    await this.assertValid(userId, changes);
    return this.users.update(userId, changes, { completeOnboarding: true });
  }

  private async assertValid(userId: string, changes: ProfileChanges): Promise<void> {
    if (changes.username !== undefined) {
      if (usernameProblem(changes.username)) throw new UsernameNotAllowedError(changes.username);
      if (await this.users.usernameTaken(changes.username, userId)) throw new UsernameTakenError(changes.username);
    }
    if (changes.hometownId !== undefined && !(await this.users.districtExists(changes.hometownId))) {
      throw new UnknownDistrictError(changes.hometownId);
    }
  }
}

function toPublic({ onboarded: _onboarded, ...profile }: MyProfile): PublicProfile {
  return profile;
}
