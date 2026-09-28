import { PostsController } from './posts.controller.js';
import type { PostsService } from './posts.service.js';

describe('PostsController', () => {
  it('delegates every route with the signed-in user', async () => {
    const service = {
      create: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      feed: vi.fn(),
      byDistrict: vi.fn(),
      byAuthor: vi.fn(),
    };
    const c = new PostsController(service as unknown as PostsService);
    const me = { id: 'u1' };
    const page = { limit: 10 };
    await c.create(me, { body: 'hi', districtId: 'kandy' });
    await c.get(me, 'p1');
    await expect(c.remove(me, 'p1')).resolves.toBeNull();
    await c.feed(me, { tab: 'following', limit: 10 });
    await c.byDistrict(me, 'kandy', page);
    await c.byAuthor(me, 'kasun', page);
    expect(service.create).toHaveBeenCalledWith('u1', { body: 'hi', districtId: 'kandy' });
    expect(service.get).toHaveBeenCalledWith('p1', 'u1');
    expect(service.delete).toHaveBeenCalledWith('p1', 'u1');
    expect(service.feed).toHaveBeenCalledWith('u1', 'following', { tab: 'following', limit: 10 });
    expect(service.byDistrict).toHaveBeenCalledWith('u1', 'kandy', page);
    expect(service.byAuthor).toHaveBeenCalledWith('u1', 'kasun', page);
  });
});
