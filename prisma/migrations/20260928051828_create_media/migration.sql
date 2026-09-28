-- CreateEnum
CREATE TYPE "MediaPurpose" AS ENUM ('POST_PHOTO', 'AVATAR');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'READY');

-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "purpose" "MediaPurpose" NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ready_at" TIMESTAMP(3),

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_key_key" ON "media"("key");

-- CreateIndex
CREATE INDEX "media_owner_id_status_idx" ON "media"("owner_id", "status");

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
