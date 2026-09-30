import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent, type UserPrivacyChangedEvent } from '../../common/events/domain-events.js';
import { MediaService } from '../media/media.service.js';
import { NotFoundError } from '../../common/errors/app-error.js';
import { usernameProblem } from '../../common/validation/username.js';
import { UnknownDistrictError, UsernameNotAllowedError, UsernameTakenError } from './users.errors.js';
import { USERS_REPOSITORY, type UsersRepository } from './users.repository.js';
import type { MediaPurpose } from '../media/media.types.js';
import type { MyProfile, ProfileChanges, PublicProfile, UserSummary } from './users.types.js';

export type UsernameAvailability = { available: true } | { available: false; reason: 'invalid' | 'reserved' | 'taken' };

/** Profile images: which upload purpose each accepts and where its URL is stored. */
interface ProfilePhoto {
  purpose: MediaPurpose;
  field: 'avatarUrl' | 'headerUrl';
}

const PROFILE_PHOTOS = {
  avatar: { purpose: 'AVATAR', field: 'avatarUrl' },
  header: { purpose: 'HEADER', field: 'headerUrl' },
} as const satisfies Record<string, ProfilePhoto>;

@Injectable()
export class UsersService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    private readonly events: EventEmitter2,
    private readonly media: MediaService,
  ) {}

  async me(userId: string): Promise<MyProfile> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError('Account not found.');
    return user;
  }

  /** @mention suggestions for what's typed after "@" (with or without the @; empty: people you follow first). */
  search(viewerId: string, query: string, limit: number): Promise<UserSummary[]> {
    const prefix = query.trim().replace(/^@/, '').toLowerCase();
    return this.users.search(viewerId, prefix, limit);
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

  /** Uses a verified AVATAR upload as the profile photo. */
  setAvatar(userId: string, mediaId: string): Promise<MyProfile> {
    return this.setPhoto(userId, mediaId, PROFILE_PHOTOS.avatar);
  }

  removeAvatar(userId: string): Promise<MyProfile> {
    return this.removePhoto(userId, PROFILE_PHOTOS.avatar);
  }

  /** Uses a verified HEADER upload as the profile banner. */
  setHeader(userId: string, mediaId: string): Promise<MyProfile> {
    return this.setPhoto(userId, mediaId, PROFILE_PHOTOS.header);
  }

  /** Back to the default banner (the hometown photo). */
  removeHeader(userId: string): Promise<MyProfile> {
    return this.removePhoto(userId, PROFILE_PHOTOS.header);
  }

  private async setPhoto(userId: string, mediaId: string, { purpose, field }: ProfilePhoto): Promise<MyProfile> {
    await this.me(userId);
    const [photo] = await this.media.claim(userId, [mediaId], purpose);
    return this.users.update(userId, { [field]: photo!.url });
  }

  private async removePhoto(userId: string, { field }: ProfilePhoto): Promise<MyProfile> {
    await this.me(userId);
    return this.users.update(userId, { [field]: null });
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
