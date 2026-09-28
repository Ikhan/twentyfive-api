import { HealthController } from './health.controller.js';
import type { HealthService } from './health.service.js';

describe('HealthController', () => {
  it('returns the health report', async () => {
    const report = { status: 'ok' as const, uptimeSeconds: 1, checks: {} };
    const controller = new HealthController({ check: vi.fn().mockResolvedValue(report) } as unknown as HealthService);
    await expect(controller.check()).resolves.toBe(report);
  });
});
