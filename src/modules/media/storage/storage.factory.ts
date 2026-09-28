import type { AppConfigService } from '../../../config/app-config.service.js';
import { UnconfiguredStorage, type ObjectStorage } from './object-storage.js';
import { S3ObjectStorage } from './s3-object-storage.js';

export function createObjectStorage(config: AppConfigService): ObjectStorage {
  const bucket = config.get('S3_BUCKET');
  const accessKeyId = config.get('S3_ACCESS_KEY_ID');
  const secretAccessKey = config.get('S3_SECRET_ACCESS_KEY');
  if (!bucket || !accessKeyId || !secretAccessKey) return new UnconfiguredStorage();
  return new S3ObjectStorage({
    bucket,
    accessKeyId,
    secretAccessKey,
    region: config.get('S3_REGION'),
    endpoint: config.get('S3_ENDPOINT'),
    forcePathStyle: config.get('S3_FORCE_PATH_STYLE'),
    publicUrl: config.get('S3_PUBLIC_URL'),
  });
}
