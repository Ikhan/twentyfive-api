import { readFileSync } from 'node:fs';
import { isVideoOfType } from './video-signature.js';

const file = (name: string) => new Uint8Array(readFileSync(`test/fixtures/videos/${name}`)).slice(0, 12);

describe('isVideoOfType', () => {
  it('recognises MP4 / MOV (either claim) and WebM from their first bytes', () => {
    expect(isVideoOfType(file('short.mp4'), 'video/mp4')).toBe(true);
    expect(isVideoOfType(file('short.mov'), 'video/quicktime')).toBe(true);
    expect(isVideoOfType(file('short.mov'), 'video/mp4')).toBe(true);
    expect(isVideoOfType(file('short.webm'), 'video/webm')).toBe(true);
  });

  it('refuses files that only claim to be videos', () => {
    expect(isVideoOfType(file('short.webm'), 'video/mp4')).toBe(false);
    expect(isVideoOfType(file('short.mp4'), 'video/webm')).toBe(false);
    expect(isVideoOfType(new TextEncoder().encode('<html><body>hi'), 'video/mp4')).toBe(false);
  });
});
