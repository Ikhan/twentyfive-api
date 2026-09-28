import { HttpStatus } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error.js';

export interface PresignedUpload {
  /** POST the file here as multipart/form-data… */
  url: string;
  /** …with these fields first, then the file as `file`. */
  fields: Record<string, string>;
}

export interface ObjectInfo {
  sizeBytes: number;
}

/**
 * Where photos live. S3 in production, MinIO locally, in-memory in tests.
 * Browsers upload directly using a presigned POST, so the API never streams file bytes.
 */
export interface ObjectStorage {
  readonly configured: boolean;
  /** Presigned POST that only accepts this key, this content type and at most maxBytes. */
  presignUpload(input: {
    key: string;
    contentType: string;
    maxBytes: number;
    expiresInSeconds: number;
  }): Promise<PresignedUpload>;
  /** Size of an uploaded object, or null if nothing was uploaded. */
  stat(key: string): Promise<ObjectInfo | null>;
  /** First `bytes` bytes of the object, to check what it really is. */
  readPrefix(key: string, bytes: number): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
  ping(): Promise<boolean>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export class StorageUnavailableError extends AppError {
  readonly status = HttpStatus.SERVICE_UNAVAILABLE;
  readonly code = 'STORAGE_UNAVAILABLE';

  constructor() {
    super('Photo uploads aren’t available right now.');
  }
}

/** Used when S3 isn't configured (e.g. local dev without MinIO): every operation fails clearly with 503. */
export class UnconfiguredStorage implements ObjectStorage {
  readonly configured = false;

  presignUpload(): Promise<PresignedUpload> {
    return Promise.reject(new StorageUnavailableError());
  }
  stat(): Promise<ObjectInfo | null> {
    return Promise.reject(new StorageUnavailableError());
  }
  readPrefix(): Promise<Uint8Array> {
    return Promise.reject(new StorageUnavailableError());
  }
  delete(): Promise<void> {
    return Promise.reject(new StorageUnavailableError());
  }
  publicUrl(): string {
    throw new StorageUnavailableError();
  }
  ping(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
