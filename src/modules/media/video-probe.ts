import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import mediaInfoFactory, { type MediaInfo } from 'mediainfo.js';

export interface VideoDetails {
  durationSeconds: number;
  width: number;
  height: number;
}

export interface VideoProbe {
  /**
   * Reads a video's length and picture size from its container, fetching only the byte ranges it needs
   * (`read`), so a large file is never downloaded. Null if it isn't a readable video.
   */
  probe(sizeBytes: number, read: (offset: number, length: number) => Promise<Uint8Array>): Promise<VideoDetails | null>;
}

export const VIDEO_PROBE = Symbol('VIDEO_PROBE');

interface Track {
  '@type': string;
  Duration?: number | string;
  Width?: number | string;
  Height?: number | string;
}

const num = (value: number | string | undefined): number => Number(value ?? NaN);

/** MediaInfo (the widely used media analyser, as WebAssembly). One instance, used one file at a time. */
@Injectable()
export class MediaInfoVideoProbe implements VideoProbe, OnModuleDestroy {
  private instance?: Promise<MediaInfo<'object'>>;
  private queue: Promise<unknown> = Promise.resolve();

  probe(
    sizeBytes: number,
    read: (offset: number, length: number) => Promise<Uint8Array>,
  ): Promise<VideoDetails | null> {
    const run = this.queue.then(() => this.analyse(sizeBytes, read));
    this.queue = run.catch(() => undefined);
    return run;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.instance) (await this.instance).close();
  }

  private async analyse(
    sizeBytes: number,
    read: (offset: number, length: number) => Promise<Uint8Array>,
  ): Promise<VideoDetails | null> {
    this.instance ??= mediaInfoFactory({ format: 'object' });
    const mediaInfo = await this.instance;
    const result = await mediaInfo.analyzeData(sizeBytes, (length, offset) => read(offset, length));
    const tracks = (result.media?.track ?? []) as Track[];
    const general = tracks.find((t) => t['@type'] === 'General');
    const video = tracks.find((t) => t['@type'] === 'Video');
    const details = { durationSeconds: num(general?.Duration), width: num(video?.Width), height: num(video?.Height) };
    return video && Object.values(details).every((n) => Number.isFinite(n) && n > 0) ? details : null;
  }
}
