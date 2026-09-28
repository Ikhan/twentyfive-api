import { InMemoryUsersRepository, profile } from '../../../test/fakes/users-fakes.js';
import { NotFoundError } from '../../common/errors/app-error.js';
import { UnknownDistrictError, UsernameNotAllowedError, UsernameTakenError } from './users.errors.js';
import { UsersService } from './users.service.js';

function setup() {
  const repo = new InMemoryUsersRepository(
    profile(),
    profile({ id: 'u-tharushi', username: 'tharushi', displayName: 'Tharushi' }),
  );
  return { repo, service: new UsersService(repo) };
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
});
