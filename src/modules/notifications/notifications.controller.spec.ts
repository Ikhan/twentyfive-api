import { NotificationsController } from './notifications.controller.js';
import type { NotificationsService } from './notifications.service.js';

describe('NotificationsController', () => {
  it('delegates every route with the signed-in user', async () => {
    const service = { list: vi.fn(), unreadCount: vi.fn(), markAllRead: vi.fn(), markRead: vi.fn() };
    const c = new NotificationsController(service as unknown as NotificationsService);
    const me = { id: 'u1' };
    await c.list(me, { limit: 5 });
    await c.unreadCount(me);
    await expect(c.markAllRead(me)).resolves.toBeNull();
    await expect(c.markRead(me, 'n1')).resolves.toBeNull();
    expect(service.list).toHaveBeenCalledWith('u1', { limit: 5 });
    expect(service.unreadCount).toHaveBeenCalledWith('u1');
    expect(service.markAllRead).toHaveBeenCalledWith('u1');
    expect(service.markRead).toHaveBeenCalledWith('u1', 'n1');
  });
});
