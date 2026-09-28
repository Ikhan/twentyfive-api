import { HTML, JPEG, PNG } from '../../../test/fakes/media-fakes.js';
import { detectImageType } from './image-signature.js';

describe('detectImageType', () => {
  it('recognises JPEG, PNG and WebP by their magic bytes', () => {
    expect(detectImageType(JPEG)).toBe('image/jpeg');
    expect(detectImageType(PNG)).toBe('image/png');
    const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
    expect(detectImageType(webp)).toBe('image/webp');
  });

  it('rejects anything else, including RIFF files that aren’t WebP and empty input', () => {
    expect(detectImageType(HTML)).toBeNull();
    expect(detectImageType(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20]))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
});
