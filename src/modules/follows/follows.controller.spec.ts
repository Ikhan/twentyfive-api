import { FollowRequestsController, FollowsController } from './follows.controller.js';
import type { FollowsService } from './follows.service.js';

describe('Follows controllers', () => {
  const service = {
    follow: vi.fn(),
    unfollow: vi.fn(),
    stats: vi.fn(),
    followers: vi.fn(),
    following: vi.fn(),
    requests: vi.fn(),
    acceptRequest: vi.fn(),
    declineRequest: vi.fn(),
  };
  const me = { id: 'u1' };
  const page = { limit: 10 };

  it('FollowsController delegates with the signed-in user', async () => {
    const c = new FollowsController(service as unknown as FollowsService);
    await c.follow(me, 'kasun');
    await c.unfollow(me, 'kasun');
    await c.stats(me, 'kasun');
    await c.followers(me, 'kasun', page);
    await c.following(me, 'kasun', page);
    expect(service.follow).toHaveBeenCalledWith('u1', 'kasun');
    expect(service.unfollow).toHaveBeenCalledWith('u1', 'kasun');
    expect(service.stats).toHaveBeenCalledWith('u1', 'kasun');
    expect(service.followers).toHaveBeenCalledWith('u1', 'kasun', page);
    expect(service.following).toHaveBeenCalledWith('u1', 'kasun', page);
  });

  it('FollowRequestsController lists, accepts and declines', async () => {
    const c = new FollowRequestsController(service as unknown as FollowsService);
    await c.list(me, page);
    await expect(c.accept(me, 'kasun')).resolves.toBeNull();
    await expect(c.decline(me, 'dilan')).resolves.toBeNull();
    expect(service.requests).toHaveBeenCalledWith('u1', page);
    expect(service.acceptRequest).toHaveBeenCalledWith('u1', 'kasun');
    expect(service.declineRequest).toHaveBeenCalledWith('u1', 'dilan');
  });
});
