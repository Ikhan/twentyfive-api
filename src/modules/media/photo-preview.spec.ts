import sharp from 'sharp';
import { PREVIEW_PIXELS, SharpPhotoPreviewer } from './photo-preview.js';

const image = (width: number, height: number, format: 'jpeg' | 'png' | 'webp' = 'jpeg') =>
  sharp({ create: { width, height, channels: 3, background: '#3a7bd5' } })
    [format]()
    .toBuffer();

describe('SharpPhotoPreviewer', () => {
  const previewer = new SharpPhotoPreviewer();

  it('reads the picture size and makes a tiny WebP preview in its shape', async () => {
    const preview = await previewer.preview(await image(1200, 800));
    expect(preview).toMatchObject({ width: 1200, height: 800 });
    expect(preview!.placeholder).toMatch(/^data:image\/webp;base64,/);
    const tiny = await sharp(Buffer.from(preview!.placeholder.split(',')[1]!, 'base64')).metadata();
    expect(tiny).toMatchObject({ width: PREVIEW_PIXELS, height: Math.round((PREVIEW_PIXELS * 800) / 1200) });
    expect(preview!.placeholder.length).toBeLessThan(1000);
  });

  it('works for PNG and WebP too', async () => {
    await expect(previewer.preview(await image(300, 600, 'png'))).resolves.toMatchObject({ width: 300, height: 600 });
    await expect(previewer.preview(await image(50, 50, 'webp'))).resolves.toMatchObject({ width: 50, height: 50 });
  });

  it('uses the shape the photo is shown in, for phone photos rotated by EXIF', async () => {
    const rotated = await sharp(await image(400, 300))
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    await expect(previewer.preview(rotated)).resolves.toMatchObject({ width: 300, height: 400 });
  });

  it('returns null for files it can’t decode', async () => {
    await expect(previewer.preview(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]))).resolves.toBeNull();
  });
});
