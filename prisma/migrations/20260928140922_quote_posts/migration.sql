-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'QUOTE';

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "is_quote" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quoted_post_id" UUID;

-- CreateIndex
CREATE INDEX "posts_quoted_post_id_idx" ON "posts"("quoted_post_id");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_quoted_post_id_fkey" FOREIGN KEY ("quoted_post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
