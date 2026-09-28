import { EventEmitter2 } from '@nestjs/event-emitter';
import { FakeObjectStorage, InMemoryMediaRepository, JPEG, PNG } from '../../../test/fakes/media-fakes.js';
import { InMemoryUsersRepository, profile } from '../../../test/fakes/users-fakes.js';
import { InvalidUploadError } from '../media/media.errors.js';
import { MediaService } from '../media/media.service.js';
import { DomainEvent } from '../../common/events/domain-events.js';
import { NotFoundError } from '../../common/errors/app-error.js';
import { UnknownDistrictError, UsernameNotAllowedError, UsernameTakenError } from './users.errors.js';
import { UsersService } from './users.service.js';

function setup() {
  const repo = new InMemoryUsersRepository(
    profile(),
    profile({ id: 'u-tharushi', username: 'tharushi', displayName: 'Tharushi' }),
  );
  const events = new EventEmitter2();
  const emitted: unknown[] = [];
  events.on(DomainEvent.UserPrivacyChanged, (e) => emitted.push(e));
  const storage = new FakeObjectStorage();
  const media = new MediaService(new InMemoryMediaRepository(), storage);
  return { repo, events, emitted, storage, media, service: new UsersService(repo, events, media) };
}

describe('UsersService', () => {
  it('returns your own profile, or 404 if the account is gone', async () => {
    const { service } = setup();
    await expect(service.me('u-kasun')).resolves.toMatchObject({ username: 'kasunperera', onboarded: false });
    await expect(service.me('ghost')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns public profiles by username, case-insensitively and without private fields', async () => {
    const { service } = setup();
    const result = await service.byUsername('Tharushi');
    expect(result).toMatchObject({ username: 'tharushi', displayName: 'Tharushi' });
    expect(result).not.toHaveProperty('onboarded');
    await expect(service.byUsername('nobody')).rejects.toBeInstanceOf(NotFoundError);
  });

  describe('usernameAvailability', () => {
    it.each([
      ['kasun', { available: true }],
      ['kasunperera', { available: true }], // your own current handle
      ['tharushi', { available: false, reason: 'taken' }],
      ['admin', { available: false, reason: 'reserved' }],
      ['ka', { available: false, reason: 'invalid' }],
    ])('%s → %o', async (username, expected) => {
      await expect(setup().service.usernameAvailability(username, 'u-kasun')).resolves.toEqual(expected);
    });
  });

  describe('updateProfile', () => {
    it('applies valid changes', async () => {
      const updated = await setup().service.updateProfile('u-kasun', {
        displayName: 'Kasun P',
        username: 'kasun',
        bio: 'Kandy boy',
        hometownId: 'kandy',
        isPrivate: true,
      });
      expect(updated).toMatchObject({
        displayName: 'Kasun P',
        username: 'kasun',
        bio: 'Kandy boy',
        hometown: { id: 'kandy', name: 'Kandy' },
        isPrivate: true,
      });
    });

    it('announces privacy changes (and only real changes)', async () => {
      const { service, emitted } = setup();
      await service.updateProfile('u-kasun', { bio: 'no privacy change', isPrivate: false });
      expect(emitted).toEqual([]);
      await service.updateProfile('u-kasun', { isPrivate: true });
      await service.updateProfile('u-kasun', { isPrivate: false });
      expect(emitted).toEqual([
        { userId: 'u-kasun', isPrivate: true },
        { userId: 'u-kasun', isPrivate: false },
      ]);
    });

    it('allows keeping your current username', async () => {
      await expect(setup().service.updateProfile('u-kasun', { username: 'kasunperera' })).resolves.toMatchObject({
        username: 'kasunperera',
      });
    });

    it('rejects taken, reserved and badly formed usernames', async () => {
      const { service } = setup();
      await expect(service.updateProfile('u-kasun', { username: 'tharushi' })).rejects.toBeInstanceOf(
        UsernameTakenError,
      );
      await expect(service.updateProfile('u-kasun', { username: 'settings' })).rejects.toBeInstanceOf(
        UsernameNotAllowedError,
      );
      await expect(service.updateProfile('u-kasun', { username: 'Bad Name' })).rejects.toBeInstanceOf(
        UsernameNotAllowedError,
      );
    });

    it('rejects districts that don’t exist', async () => {
      await expect(setup().service.updateProfile('u-kasun', { hometownId: 'atlantis' })).rejects.toBeInstanceOf(
        UnknownDistrictError,
      );
    });

    it('404s for a deleted account', async () => {
      await expect(setup().service.updateProfile('ghost', { bio: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('completeOnboarding', () => {
    it('saves the profile and marks the user onboarded', async () => {
      const { service } = setup();
      const done = await service.completeOnboarding('u-kasun', {
        displayName: 'Kasun Perera',
        username: 'kasun',
        hometownId: 'kandy',
        bio: 'Hi',
        isPrivate: false,
      });
      expect(done).toMatchObject({
        onboarded: true,
        username: 'kasun',
        hometown: { id: 'kandy', name: 'Kandy' },
        bio: 'Hi',
      });
    });

    it('validates like a profile edit', async () => {
      await expect(
        setup().service.completeOnboarding('u-kasun', { displayName: 'K', username: 'tharushi', hometownId: 'kandy' }),
      ).rejects.toBeInstanceOf(UsernameTakenError);
      await expect(
        setup().service.completeOnboarding('u-kasun', { displayName: 'K', username: 'kasun', hometownId: 'mars' }),
      ).rejects.toBeInstanceOf(UnknownDistrictError);
    });

    it('can be retried safely', async () => {
      const { service } = setup();
      const input = { displayName: 'Kasun', username: 'kasun', hometownId: 'kandy' };
      await service.completeOnboarding('u-kasun', input);
      await expect(service.completeOnboarding('u-kasun', input)).resolves.toMatchObject({ onboarded: true });
    });
  });

  describe('avatar', () => {
    it('sets a verified avatar upload as the profile photo, and removes it', async () => {
      const { service, media, storage } = setup();
      const ticket = await media.createUpload('u-kasun', {
        purpose: 'AVATAR',
        contentType: 'image/jpeg',
        sizeBytes: 1000,
      });
      storage.put(storage.presigned[0]!.key, JPEG, 1000);
      await media.complete('u-kasun', ticket.mediaId);

      const withPhoto = await service.setAvatar('u-kasun', ticket.mediaId);
      expect(withPhoto.avatarUrl).toMatch(/^https:\/\/cdn\.test\/avatar\/u-kasun\/.+\.jpg$/);
      await expect(service.removeAvatar('u-kasun')).resolves.toMatchObject({ avatarUrl: null });
    });

    it('rejects uploads that aren’t verified, aren’t yours or are post photos', async () => {
      const { service, media } = setup();
      const pending = await media.createUpload('u-kasun', {
        purpose: 'AVATAR',
        contentType: 'image/jpeg',
        sizeBytes: 1000,
      });
      await expect(service.setAvatar('u-kasun', pending.mediaId)).rejects.toBeInstanceOf(InvalidUploadError);
      await expect(service.setAvatar('ghost', pending.mediaId)).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.removeAvatar('ghost')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('header', () => {
    it('sets a verified header upload as the profile header, and removes it', async () => {
      const { service, media, storage } = setup();
      const ticket = await media.createUpload('u-kasun', {
        purpose: 'HEADER',
        contentType: 'image/png',
        sizeBytes: 1000,
      });
      storage.put(storage.presigned[0]!.key, PNG, 1000);
      await media.complete('u-kasun', ticket.mediaId);

      const withHeader = await service.setHeader('u-kasun', ticket.mediaId);
      expect(withHeader.headerUrl).toMatch(/^https:\/\/cdn\.test\/header\/u-kasun\/.+\.png$/);
      expect(withHeader.avatarUrl).toBeNull();
      await expect(service.removeHeader('u-kasun')).resolves.toMatchObject({ headerUrl: null });
    });

    it('rejects avatars, unverified uploads and unknown users', async () => {
      const { service, media, storage } = setup();
      const avatar = await media.createUpload('u-kasun', {
        purpose: 'AVATAR',
        contentType: 'image/jpeg',
        sizeBytes: 1000,
      });
      storage.put(storage.presigned[0]!.key, JPEG, 1000);
      await media.complete('u-kasun', avatar.mediaId);
      await expect(service.setHeader('u-kasun', avatar.mediaId)).rejects.toBeInstanceOf(InvalidUploadError);
      const pending = await media.createUpload('u-kasun', {
        purpose: 'HEADER',
        contentType: 'image/jpeg',
        sizeBytes: 1000,
      });
      await expect(service.setHeader('u-kasun', pending.mediaId)).rejects.toBeInstanceOf(InvalidUploadError);
      await expect(service.setHeader('ghost', pending.mediaId)).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.removeHeader('ghost')).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
