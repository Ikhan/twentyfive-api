import { Injectable } from '@nestjs/common';
import { MediaStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { MediaRepository } from './media.repository.js';
import type { MediaPurpose, MediaRecord } from './media.types.js';
import type { PhotoPreview } from './photo-preview.js';
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
  placeholder: true,
} as const;

type Row = {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  placeholder: string | null;
} & Omit<MediaRecord, 'video' | 'photo'>;

const toRecord = ({ durationSeconds, width, height, placeholder, ...media }: Row): MediaRecord => ({
  ...media,
  video: durationSeconds !== null && width !== null && height !== null ? { durationSeconds, width, height } : null,
  photo: placeholder !== null && width !== null && height !== null ? { width, height, placeholder } : null,
});

@Injectable()
export class PrismaMediaRepository implements MediaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(media: Omit<MediaRecord, 'status' | 'sizeBytes' | 'video' | 'photo'>): Promise<MediaRecord> {
    return toRecord(await this.prisma.media.create({ data: media, select: SELECT }));
  }

  async findById(id: string): Promise<MediaRecord | null> {
    const row = await this.prisma.media.findUnique({ where: { id }, select: SELECT });
    return row && toRecord(row);
  }

  async markReady(
    id: string,
    sizeBytes: number,
    details: VideoDetails | PhotoPreview | null = null,
  ): Promise<MediaRecord> {
    const row = await this.prisma.media.update({
      where: { id },
      data: { status: MediaStatus.READY, sizeBytes, readyAt: new Date(), ...details },
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
        commentPhoto: { is: null },
        commentVideo: { is: null },
      },
      select: SELECT,
    });
    return rows.map(toRecord);
  }
}
