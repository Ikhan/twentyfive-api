import type { HealthIndicator } from './health-indicator.js';
import { ServiceUnavailableError } from './health.errors.js';
import { HealthService } from './health.service.js';

const indicator = (name: string, check: () => Promise<boolean>): HealthIndicator => ({ name, check });

describe('HealthService', () => {
  it('is ok with no indicators', async () => {
    await expect(new HealthService().check()).resolves.toMatchObject({ status: 'ok', checks: {} });
  });

  it('reports every indicator that is up', async () => {
    const service = new HealthService([
      indicator('database', async () => true),
      indicator('storage', async () => true),
    ]);
    await expect(service.check()).resolves.toMatchObject({ checks: { database: 'up', storage: 'up' } });
  });

  it('throws 503 with the failing checks when one is down or throws', async () => {
    const service = new HealthService([
      indicator('database', async () => true),
      indicator('storage', async () => false),
      indicator('cache', async () => {
        throw new Error('timeout');
      }),
    ]);
    const error = await service.check().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect((error as ServiceUnavailableError).details).toEqual({ database: 'up', storage: 'down', cache: 'down' });
  });
});
