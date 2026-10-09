import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

/** A photo's picture size (as shown, after EXIF rotation) and a tiny blurred-up stand-in to show while it loads. */
export interface PhotoPreview {
  width: number;
  height: number;
  /** A 64px WebP as a data: URL (under a kilobyte for a typical photo), sent inline with the post. */
  placeholder: string;
}

export interface PhotoPreviewer {
  /** Null if the file can't be decoded as an image. */
  preview(bytes: Uint8Array): Promise<PhotoPreview | null>;
}

export const PHOTO_PREVIEWER = Symbol('PHOTO_PREVIEWER');

/**
 * The preview's longer side, in pixels: enough to make out people and places behind a light blur
 * (like Twitter's "Load image"), still small enough to send with every post.
 */
export const PREVIEW_PIXELS = 64;

@Injectable()
export class SharpPhotoPreviewer implements PhotoPreviewer {
  async preview(bytes: Uint8Array): Promise<PhotoPreview | null> {
    try {
      const { autoOrient } = await sharp(bytes).metadata();
      const tiny = await sharp(bytes)
        .rotate()
        .resize(PREVIEW_PIXELS, PREVIEW_PIXELS, { fit: 'inside' })
        .webp({ quality: 50 })
        .toBuffer();
      return {
        width: autoOrient.width,
        height: autoOrient.height,
        placeholder: `data:image/webp;base64,${tiny.toString('base64')}`,
      };
    } catch {
      return null;
    }
  }
}
