import { testPrismaService } from '../../test/helpers/test-prisma-service.js';
import { DatabaseHealthIndicator } from './database.health.js';

describe('PrismaService (integration)', () => {
  const prisma = testPrismaService();

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
