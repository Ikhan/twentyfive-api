import { Injectable } from '@nestjs/common';
import { MediaStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { MediaRepository } from './media.repository.js';
import type { MediaPurpose, MediaRecord } from './media.types.js';
import type { VideoDetails } from './video-probe.js';

const SELECT = {
  id: true,
  ownerId: true,
  purpose: true,
  status: true,
  key: true,
  contentType: true,
  sizeBytes: true,
  durationSeconds: true,
  width: true,
  height: true,
} as const;

type Row = { durationSeconds: number | null; width: number | null; height: number | null } & Omit<MediaRecord, 'video'>;

const toRecord = ({ durationSeconds, width, height, ...media }: Row): MediaRecord => ({
  ...media,
  video: durationSeconds !== null && width !== null && height !== null ? { durationSeconds, width, height } : null,
});

@Injectable()
export class PrismaMediaRepository implements MediaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(media: Omit<MediaRecord, 'status' | 'sizeBytes' | 'video'>): Promise<MediaRecord> {
    return toRecord(await this.prisma.media.create({ data: media, select: SELECT }));
  }

  async findById(id: string): Promise<MediaRecord | null> {
    const row = await this.prisma.media.findUnique({ where: { id }, select: SELECT });
    return row && toRecord(row);
  }

  async markReady(id: string, sizeBytes: number, video: VideoDetails | null = null): Promise<MediaRecord> {
    const row = await this.prisma.media.update({
      where: { id },
      data: { status: MediaStatus.READY, sizeBytes, readyAt: new Date(), ...video },
      select: SELECT,
    });
    return toRecord(row);
  }

  async findReady(ownerId: string, ids: string[], purpose: MediaPurpose): Promise<MediaRecord[]> {
    const rows = await this.prisma.media.findMany({
      // Each upload can only belong to one post, so ones already attached aren't available.
      where: {
        id: { in: ids },
        ownerId,
        purpose,
        status: MediaStatus.READY,
        postPhoto: { is: null },
        postVideo: { is: null },
      },
      select: SELECT,
    });
    return rows.map(toRecord);
  }
}
