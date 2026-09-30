export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;
export type VideoType = (typeof ALLOWED_VIDEO_TYPES)[number];

export const VIDEO_EXTENSION: Record<VideoType, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

/**
 * Whether the file's first bytes match the video type claimed. MP4 and QuickTime (.mov) share one container
 * ("ftyp" at byte 4), so either claim is fine for either; WebM starts with the EBML header 1A 45 DF A3.
 */
export function isVideoOfType(bytes: Uint8Array, claimed: VideoType): boolean {
  const at = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (claimed === 'video/webm') return at([0x1a, 0x45, 0xdf, 0xa3]);
  return at([0x66, 0x74, 0x79, 0x70], 4); // "ftyp"
}
