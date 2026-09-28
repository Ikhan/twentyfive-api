import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { JPEG } from '../../../../test/fakes/media-fakes.js';
import { TEST_S3 } from '../../../../test/setup/test-env.js';
import type { PresignedUpload } from './object-storage.js';
import { S3ObjectStorage } from './s3-object-storage.js';

/** Does what the browser does with a presigned POST. */
async function browserUpload(upload: PresignedUpload, bytes: Uint8Array, contentType: string): Promise<number> {
  const form = new FormData();
  for (const [name, value] of Object.entries(upload.fields))
    form.append(name, name === 'Content-Type' ? contentType : value);
  form.append('file', new Blob([bytes as Uint8Array<ArrayBuffer>], { type: contentType }));
  return (await fetch(upload.url, { method: 'POST', body: form })).status;
}

describe('S3ObjectStorage against MinIO (integration)', () => {
  const storage = new S3ObjectStorage(TEST_S3);

  beforeAll(async () => {
    const client = new S3Client({
      region: TEST_S3.region,
      endpoint: TEST_S3.endpoint,
      forcePathStyle: true,
      credentials: TEST_S3,
    });
    await client
      .send(new HeadBucketCommand({ Bucket: TEST_S3.bucket }))
      .catch(() => client.send(new CreateBucketCommand({ Bucket: TEST_S3.bucket })));
  });

  const key = () => `test/${randomUUID()}.jpg`;
  const image = (size: number) => {
    const bytes = new Uint8Array(size);
    bytes.set(JPEG);
    return bytes;
  };

  it('pings the bucket', async () => {
    await expect(storage.ping()).resolves.toBe(true);
  });

  it('accepts a browser upload within the presigned limits, then stats, reads and deletes it', async () => {
    const k = key();
    const upload = await storage.presignUpload({
      key: k,
      contentType: 'image/jpeg',
      maxBytes: 5000,
      expiresInSeconds: 60,
    });
    expect(await browserUpload(upload, image(3000), 'image/jpeg')).toBe(204);
    await expect(storage.stat(k)).resolves.toEqual({ sizeBytes: 3000 });
    expect(Array.from(await storage.readPrefix(k, 3))).toEqual([0xff, 0xd8, 0xff]);
    await storage.delete(k);
    await expect(storage.stat(k)).resolves.toBeNull();
  });

  it('S3 itself refuses files over the size limit or with another content type', async () => {
    const k = key();
    const upload = await storage.presignUpload({
      key: k,
      contentType: 'image/jpeg',
      maxBytes: 1000,
      expiresInSeconds: 60,
    });
    expect(await browserUpload(upload, image(5000), 'image/jpeg')).toBe(400);
    expect(await browserUpload(upload, image(500), 'text/html')).toBe(403);
    await expect(storage.stat(k)).resolves.toBeNull();
  });

  it('builds URLs under the endpoint and bucket', () => {
    expect(storage.publicUrl('a/b.jpg')).toBe(`${TEST_S3.endpoint}/${TEST_S3.bucket}/a/b.jpg`);
  });
});
