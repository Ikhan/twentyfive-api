import type { BlocksService } from './blocks.service.js';
import { BlocksController, ReportsController } from './moderation.controller.js';
import type { ReportsService } from './reports.service.js';

describe('Moderation controllers', () => {
  const me = { id: 'u1' };

  it('delegates blocks with the signed-in user', async () => {
    const service = { blocked: vi.fn(), block: vi.fn(), unblock: vi.fn() };
    const c = new BlocksController(service as unknown as BlocksService);
    await c.list(me, { limit: 5 });
    await c.block(me, 'arun');
    await c.unblock(me, 'arun');
    expect(service.blocked).toHaveBeenCalledWith('u1', { limit: 5 });
    expect(service.block).toHaveBeenCalledWith('u1', 'arun');
    expect(service.unblock).toHaveBeenCalledWith('u1', 'arun');
  });

  it('files reports as the signed-in user, details optional', async () => {
    const service = { report: vi.fn() };
    const c = new ReportsController(service as unknown as ReportsService);
    const dto = { targetType: 'USER' as const, targetId: 'u2', reason: 'SPAM' as const };
    await expect(c.report(me, dto)).resolves.toBeNull();
    await c.report(me, { ...dto, details: 'bot' });
    expect(service.report.mock.calls).toEqual([
      [{ reporterId: 'u1', ...dto, details: '' }],
      [{ reporterId: 'u1', ...dto, details: 'bot' }],
    ]);
  });
});
