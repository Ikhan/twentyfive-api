import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import type { ObjectInfo, ObjectStorage, PresignedUpload } from './object-storage.js';

export interface S3Settings {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  /** Base URL objects are served from; defaults to the bucket's own URL. */
  publicUrl?: string;
}

/** AWS S3 (or any S3-compatible store such as MinIO). */
export class S3ObjectStorage implements ObjectStorage {
  readonly configured = true;
  private readonly client: S3Client;

  constructor(private readonly settings: S3Settings) {
    this.client = new S3Client({
      region: settings.region,
      endpoint: settings.endpoint,
      forcePathStyle: settings.forcePathStyle,
      credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
    });
  }

  async presignUpload({
    key,
    contentType,
    maxBytes,
    expiresInSeconds,
  }: {
    key: string;
    contentType: string;
    maxBytes: number;
    expiresInSeconds: number;
  }): Promise<PresignedUpload> {
    const { url, fields } = await createPresignedPost(this.client, {
      Bucket: this.settings.bucket,
      Key: key,
      Fields: { 'Content-Type': contentType },
      Conditions: [
        ['content-length-range', 1, maxBytes],
        ['eq', '$Content-Type', contentType],
      ],
      Expires: expiresInSeconds,
    });
    return { url, fields };
  }

  async stat(key: string): Promise<ObjectInfo | null> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.settings.bucket, Key: key }));
      return { sizeBytes: head.ContentLength ?? 0 };
    } catch (error) {
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) return null;
      throw error;
    }
  }

  async readPrefix(key: string, bytes: number): Promise<Uint8Array> {
    const object = await this.client.send(
      new GetObjectCommand({ Bucket: this.settings.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }),
    );
    return object.Body ? object.Body.transformToByteArray() : new Uint8Array();
  }

  async readRange(key: string, offset: number, length: number): Promise<Uint8Array> {
    if (length <= 0) return new Uint8Array();
    const object = await this.client.send(
      new GetObjectCommand({ Bucket: this.settings.bucket, Key: key, Range: `bytes=${offset}-${offset + length - 1}` }),
    );
    return object.Body ? object.Body.transformToByteArray() : new Uint8Array();
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.settings.bucket, Key: key }));
  }

  publicUrl(key: string): string {
    const base =
      this.settings.publicUrl ??
      (this.settings.endpoint
        ? `${this.settings.endpoint}/${this.settings.bucket}`
        : `https://${this.settings.bucket}.s3.${this.settings.region}.amazonaws.com`);
    return `${base.replace(/\/$/, '')}/${key}`;
  }

  async ping(): Promise<boolean> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.settings.bucket }));
    return true;
  }
}
