import { profile } from '../../../test/fakes/users-fakes.js';
import { UsersController } from './users.controller.js';
import type { UsersService } from './users.service.js';

describe('UsersController', () => {
  const me = profile();
  const service = {
    me: vi.fn().mockResolvedValue(me),
    updateProfile: vi.fn().mockResolvedValue(me),
    completeOnboarding: vi.fn().mockResolvedValue({ ...me, onboarded: true }),
    usernameAvailability: vi.fn().mockResolvedValue({ available: true }),
    byUsername: vi.fn().mockResolvedValue(me),
    setAvatar: vi.fn().mockResolvedValue(me),
    removeAvatar: vi.fn().mockResolvedValue(me),
  };
  const controller = new UsersController(service as unknown as UsersService);
  const user = { id: 'u-kasun' };

  it('delegates each route to the service with the signed-in user', async () => {
    await expect(controller.me(user)).resolves.toBe(me);
    await controller.update(user, { bio: 'hi' });
    expect(service.updateProfile).toHaveBeenCalledWith('u-kasun', { bio: 'hi' });
    const onboarding = { displayName: 'K', username: 'kasun', hometownId: 'kandy' };
    await expect(controller.onboard(user, onboarding)).resolves.toMatchObject({ onboarded: true });
    expect(service.completeOnboarding).toHaveBeenCalledWith('u-kasun', onboarding);
    await controller.availability(user, { username: 'kasun' });
    expect(service.usernameAvailability).toHaveBeenCalledWith('kasun', 'u-kasun');
    await controller.setAvatar(user, { mediaId: 'm1' });
    expect(service.setAvatar).toHaveBeenCalledWith('u-kasun', 'm1');
    await controller.removeAvatar(user);
    expect(service.removeAvatar).toHaveBeenCalledWith('u-kasun');
    await controller.profile('kasunperera');
    expect(service.byUsername).toHaveBeenCalledWith('kasunperera');
  });
});
