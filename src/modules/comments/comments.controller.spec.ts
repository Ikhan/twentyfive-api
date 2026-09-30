import { CommentsController } from './comments.controller.js';
import type { CommentsService } from './comments.service.js';

describe('CommentsController', () => {
  it('delegates every route with the signed-in user', async () => {
    const service = { list: vi.fn(), add: vi.fn(), remove: vi.fn(), replies: vi.fn() };
    const c = new CommentsController(service as unknown as CommentsService);
    const me = { id: 'u1' };
    await c.list(me, 'p1', { limit: 10 });
    await c.add(me, 'p1', { body: 'hi' });
    await c.add(me, 'p1', { body: 'yes', parentId: 'c1' });
    await c.replies(me, 'c1', { limit: 5 });
    await expect(c.remove(me, 'c1')).resolves.toBeNull();
    expect(service.list).toHaveBeenCalledWith('u1', 'p1', { limit: 10 });
    expect(service.add).toHaveBeenCalledWith('u1', 'p1', 'hi', undefined);
    expect(service.add).toHaveBeenLastCalledWith('u1', 'p1', 'yes', 'c1');
    expect(service.replies).toHaveBeenCalledWith('u1', 'c1', { limit: 5 });
    expect(service.remove).toHaveBeenCalledWith('u1', 'c1');
  });
});
