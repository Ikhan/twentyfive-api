import type { MediaRepository } from '../../src/modules/media/media.repository.js';
import type { MediaPurpose, MediaRecord } from '../../src/modules/media/media.types.js';
import type { ObjectInfo, ObjectStorage, PresignedUpload } from '../../src/modules/media/storage/object-storage.js';

export const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
export const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
export const HTML = new TextEncoder().encode('<html><script>');

/** In-memory object store; tests "upload" with put(). */
export class FakeObjectStorage implements ObjectStorage {
  readonly configured = true;
  readonly objects = new Map<string, Uint8Array>();
  readonly presigned: { key: string; contentType: string; maxBytes: number }[] = [];
  deleted: string[] = [];

  async presignUpload(input: { key: string; contentType: string; maxBytes: number }): Promise<PresignedUpload> {
    this.presigned.push(input);
    return { url: 'https://storage.test/bucket', fields: { key: input.key, 'Content-Type': input.contentType } };
  }

  put(key: string, bytes: Uint8Array, padTo = bytes.length): void {
    const body = new Uint8Array(padTo);
    body.set(bytes);
    this.objects.set(key, body);
  }

  async stat(key: string): Promise<ObjectInfo | null> {
    const object = this.objects.get(key);
    return object ? { sizeBytes: object.length } : null;
  }

  async readPrefix(key: string, bytes: number): Promise<Uint8Array> {
    return (this.objects.get(key) ?? new Uint8Array()).slice(0, bytes);
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
    this.deleted.push(key);
  }

  publicUrl(key: string): string {
    return `https://cdn.test/${key}`;
  }

  async ping(): Promise<boolean> {
    return true;
  }
}

export class InMemoryMediaRepository implements MediaRepository {
  readonly rows = new Map<string, MediaRecord>();

  async create(media: Omit<MediaRecord, 'status' | 'sizeBytes'>): Promise<MediaRecord> {
    const record: MediaRecord = { ...media, status: 'PENDING', sizeBytes: null };
    this.rows.set(record.id, record);
    return record;
  }

  async findById(id: string): Promise<MediaRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async markReady(id: string, sizeBytes: number): Promise<MediaRecord> {
    const next = { ...this.rows.get(id)!, status: 'READY' as const, sizeBytes };
    this.rows.set(id, next);
    return next;
  }

  async findReady(ownerId: string, ids: string[], purpose: MediaPurpose): Promise<MediaRecord[]> {
    return ids
      .map((id) => this.rows.get(id))
      .filter((m): m is MediaRecord => !!m && m.ownerId === ownerId && m.purpose === purpose && m.status === 'READY');
  }
}
