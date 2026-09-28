export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export const EXTENSION: Record<ImageType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** How many leading bytes detectImageType needs. */
export const SIGNATURE_BYTES = 12;

/**
 * Identifies an image from its first bytes ("magic numbers"), ignoring what the client claimed.
 * Stops someone uploading, say, an HTML file labelled image/png.
 */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  const startsWith = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  return null;
}
