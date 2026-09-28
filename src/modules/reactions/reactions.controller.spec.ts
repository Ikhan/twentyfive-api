import { ReactionsController } from './reactions.controller.js';
import type { ReactionsService } from './reactions.service.js';

describe('ReactionsController', () => {
  it('maps each route to a reaction', async () => {
    const service = { add: vi.fn(), remove: vi.fn() };
    const c = new ReactionsController(service as unknown as ReactionsService);
    const me = { id: 'u1' };
    await c.like(me, 'p1');
    await c.unlike(me, 'p1');
    await c.repost(me, 'p1');
    await c.unrepost(me, 'p1');
    expect(service.add.mock.calls).toEqual([
      ['u1', 'p1', 'like'],
      ['u1', 'p1', 'repost'],
    ]);
    expect(service.remove.mock.calls).toEqual([
      ['u1', 'p1', 'like'],
      ['u1', 'p1', 'repost'],
    ]);
  });
});
