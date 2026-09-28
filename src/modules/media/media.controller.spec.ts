import { MediaController } from './media.controller.js';
import type { MediaService } from './media.service.js';

describe('MediaController', () => {
  it('delegates to the service with the signed-in user', async () => {
    const service = { createUpload: vi.fn().mockResolvedValue({}), complete: vi.fn().mockResolvedValue({}) };
    const controller = new MediaController(service as unknown as MediaService);
    const dto = { purpose: 'AVATAR' as const, contentType: 'image/png', sizeBytes: 10 };
    await controller.createUpload({ id: 'u1' }, dto);
    await controller.complete({ id: 'u1' }, 'm1');
    expect(service.createUpload).toHaveBeenCalledWith('u1', dto);
    expect(service.complete).toHaveBeenCalledWith('u1', 'm1');
  });
});
