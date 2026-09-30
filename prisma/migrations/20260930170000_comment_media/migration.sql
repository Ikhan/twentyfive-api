-- Photos and videos in comments and replies (like posts: up to 4 photos or one video).

-- CreateTable
CREATE TABLE "comment_photos" (
    "id" UUID NOT NULL,
    "comment_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "comment_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment_videos" (
    "comment_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "duration_seconds" DOUBLE PRECISION NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,

    CONSTRAINT "comment_videos_pkey" PRIMARY KEY ("comment_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "comment_photos_media_id_key" ON "comment_photos"("media_id");

-- CreateIndex
CREATE INDEX "comment_photos_comment_id_position_idx" ON "comment_photos"("comment_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "comment_videos_media_id_key" ON "comment_videos"("media_id");

-- AddForeignKey
ALTER TABLE "comment_photos" ADD CONSTRAINT "comment_photos_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_photos" ADD CONSTRAINT "comment_photos_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_videos" ADD CONSTRAINT "comment_videos_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_videos" ADD CONSTRAINT "comment_videos_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

