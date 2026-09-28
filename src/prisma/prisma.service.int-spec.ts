import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../config/app-config.service.js';
import { validateEnv } from '../config/env.schema.js';
import { TEST_DATABASE_URL } from '../../test/setup/test-env.js';
import { DatabaseHealthIndicator } from './database.health.js';
import { PrismaService } from './prisma.service.js';

describe('PrismaService (integration)', () => {
  const config = new AppConfigService(new ConfigService(validateEnv({ DATABASE_URL: TEST_DATABASE_URL })) as never);
  const prisma = new PrismaService(config);

  beforeAll(() => prisma.onModuleInit());
  afterAll(() => prisma.onModuleDestroy());

  it('connects and passes the health check', async () => {
    await expect(new DatabaseHealthIndicator(prisma).check()).resolves.toBe(true);
  });

  it('has all 25 districts seeded, with Sinhala and Tamil names', async () => {
    const districts = await prisma.district.findMany({ orderBy: { name: 'asc' } });
    expect(districts).toHaveLength(25);
    expect(districts[0]).toMatchObject({ id: 'ampara', name: 'Ampara', province: 'EASTERN' });
    expect(districts.every((d) => d.nameSi && d.nameTa && d.famousFor.length > 0)).toBe(true);
  });
});
