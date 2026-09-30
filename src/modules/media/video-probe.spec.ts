import { readFileSync } from 'node:fs';
import { MediaInfoVideoProbe } from './video-probe.js';

describe('MediaInfoVideoProbe', () => {
  const probe = new MediaInfoVideoProbe();
  afterAll(() => probe.onModuleDestroy());

  const probeFile = (name: string) => {
    const bytes = new Uint8Array(readFileSync(`test/fixtures/videos/${name}`));
    const reads: number[] = [];
    const read = async (offset: number, length: number) => {
      reads.push(length);
      return bytes.subarray(offset, offset + length);
    };
    return { reads, result: probe.probe(bytes.length, read) };
  };

  it('reads length and size from MP4 (index first or last), MOV and WebM', async () => {
    for (const name of ['short.mp4', 'index-at-end.mp4', 'short.mov', 'short.webm']) {
      await expect(probeFile(name).result, name).resolves.toEqual({ durationSeconds: 2, width: 32, height: 18 });
    }
    await expect(probeFile('eleven-minutes.mp4').result).resolves.toMatchObject({ durationSeconds: 660 });
  });

  it('says null for files that aren’t videos', async () => {
    const text = new TextEncoder().encode('just some text, not a video at all');
    await expect(probe.probe(text.length, async (o, l) => text.subarray(o, o + l))).resolves.toBeNull();
  });

  it('handles several files at once', async () => {
    const all = await Promise.all(['short.mp4', 'short.webm', 'eleven-minutes.mp4'].map((n) => probeFile(n).result));
    expect(all.map((d) => d?.durationSeconds)).toEqual([2, 2, 660]);
  });
});
