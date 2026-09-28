import { DatabaseHealthIndicator } from './database.health.js';
import type { PrismaService } from './prisma.service.js';

describe('DatabaseHealthIndicator', () => {
  it('is up when a trivial query succeeds', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) } as unknown as PrismaService;
    await expect(new DatabaseHealthIndicator(prisma).check()).resolves.toBe(true);
  });

  it('propagates connection failures (reported as down by HealthService)', async () => {
    const prisma = { $queryRaw: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) } as unknown as PrismaService;
    await expect(new DatabaseHealthIndicator(prisma).check()).rejects.toThrow('ECONNREFUSED');
  });
});
