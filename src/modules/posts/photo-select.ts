import type { PostPhotoView } from './posts.types.js';

/** Post and comment photos, in order, with their upload's size and blurred preview. */
export const PHOTOS = {
  select: { id: true, url: true, media: { select: { width: true, height: true, placeholder: true } } },
  orderBy: { position: 'asc' },
} as const;

type PhotoRow = {
  id: string;
  url: string;
  media: { width: number | null; height: number | null; placeholder: string | null };
};

export const toPhotoViews = (rows: PhotoRow[]): PostPhotoView[] =>
  rows.map(({ id, url, media }) => ({ id, url, ...media }));
