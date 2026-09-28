import { DistrictsController } from './districts.controller.js';
import type { DistrictsService } from './districts.service.js';

describe('DistrictsController', () => {
  const service = {
    list: vi.fn().mockResolvedValue([]),
    detail: vi.fn().mockResolvedValue({}),
    follow: vi.fn().mockResolvedValue({ followerCount: 1, followedByMe: true }),
    unfollow: vi.fn().mockResolvedValue({ followerCount: 0, followedByMe: false }),
    residents: vi.fn().mockResolvedValue({ items: [], meta: { nextCursor: null, limit: 20 } }),
  };
  const controller = new DistrictsController(service as unknown as DistrictsService);

  it('passes the filter, viewer and paging through to the service', async () => {
    await controller.list({ province: 'UVA' });
    expect(service.list).toHaveBeenCalledWith('UVA', undefined);
    await controller.list({}, { id: 'u1' });
    expect(service.list).toHaveBeenLastCalledWith(undefined, 'u1');
    await controller.detail('kandy', { id: 'u1' });
    expect(service.detail).toHaveBeenCalledWith('kandy', 'u1');
    await controller.detail('kandy');
    expect(service.detail).toHaveBeenLastCalledWith('kandy', undefined);
    await controller.follow({ id: 'u1' }, 'kandy');
    expect(service.follow).toHaveBeenCalledWith('u1', 'kandy');
    await controller.unfollow({ id: 'u1' }, 'kandy');
    expect(service.unfollow).toHaveBeenCalledWith('u1', 'kandy');
    await controller.residents('kandy', { limit: 5, cursor: 'c' });
    expect(service.residents).toHaveBeenCalledWith('kandy', { limit: 5, cursor: 'c' });
  });
});
