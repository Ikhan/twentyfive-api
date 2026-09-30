-- Videos in posts (up to 10 minutes): a new upload purpose, video details on media, and post_videos.

-- AlterEnum
ALTER TYPE "MediaPurpose" ADD VALUE 'POST_VIDEO';

-- AlterTable
ALTER TABLE "media" ADD COLUMN     "duration_seconds" DOUBLE PRECISION,
ADD COLUMN     "height" INTEGER,
ADD COLUMN     "width" INTEGER;

-- CreateTable
CREATE TABLE "post_videos" (
    "post_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "duration_seconds" DOUBLE PRECISION NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,

    CONSTRAINT "post_videos_pkey" PRIMARY KEY ("post_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "post_videos_media_id_key" ON "post_videos"("media_id");

-- AddForeignKey
ALTER TABLE "post_videos" ADD CONSTRAINT "post_videos_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_videos" ADD CONSTRAINT "post_videos_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

