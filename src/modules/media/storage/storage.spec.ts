import { testConfig } from '../../../../test/fakes/config.js';
import { FakeObjectStorage } from '../../../../test/fakes/media-fakes.js';
import { healthIndicators } from '../../health/health.module.js';
import type { DatabaseHealthIndicator } from '../../../prisma/database.health.js';
import { StorageHealthIndicator } from '../storage.health.js';
import { StorageUnavailableError, UnconfiguredStorage } from './object-storage.js';
import { S3ObjectStorage } from './s3-object-storage.js';
import { createObjectStorage } from './storage.factory.js';

describe('storage wiring', () => {
  it('uses S3 only when bucket and keys are configured', () => {
    expect(createObjectStorage(testConfig())).toBeInstanceOf(UnconfiguredStorage);
    expect(createObjectStorage(testConfig({ S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'k' }))).toBeInstanceOf(
      UnconfiguredStorage,
    );
    expect(
      createObjectStorage(testConfig({ S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's' })),
    ).toBeInstanceOf(S3ObjectStorage);
  });

  it('fails every operation with a clear 503 when unconfigured', async () => {
    const storage = new UnconfiguredStorage();
    expect(storage.configured).toBe(false);
    await expect(storage.presignUpload()).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(storage.stat()).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(storage.readPrefix()).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(storage.delete()).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(() => storage.publicUrl()).toThrow(StorageUnavailableError);
    await expect(storage.ping()).resolves.toBe(false);
    expect(new StorageUnavailableError()).toMatchObject({ status: 503, code: 'STORAGE_UNAVAILABLE' });
  });

  it('builds public URLs from the CDN, a custom endpoint, or the AWS bucket host', () => {
    const base = {
      bucket: 'media',
      region: 'ap-south-1',
      accessKeyId: 'k',
      secretAccessKey: 's',
      forcePathStyle: false,
    };
    expect(new S3ObjectStorage({ ...base, publicUrl: 'https://cdn.twentyfive.lk/' }).publicUrl('a/b.jpg')).toBe(
      'https://cdn.twentyfive.lk/a/b.jpg',
    );
    expect(new S3ObjectStorage({ ...base, endpoint: 'http://localhost:9002' }).publicUrl('a.jpg')).toBe(
      'http://localhost:9002/media/a.jpg',
    );
    expect(new S3ObjectStorage(base).publicUrl('a.jpg')).toBe('https://media.s3.ap-south-1.amazonaws.com/a.jpg');
  });

  it('checks storage health only when storage is configured', async () => {
    const db = { name: 'database' } as DatabaseHealthIndicator;
    expect(healthIndicators(db, new UnconfiguredStorage()).map((i) => i.name)).toEqual(['database']);
    const indicators = healthIndicators(db, new FakeObjectStorage());
    expect(indicators.map((i) => i.name)).toEqual(['database', 'storage']);
    await expect((indicators[1] as StorageHealthIndicator).check()).resolves.toBe(true);
  });
});
