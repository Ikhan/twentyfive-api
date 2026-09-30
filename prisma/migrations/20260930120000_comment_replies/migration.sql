-- One level of replies to comments, and notifications for them.
ALTER TYPE "NotificationType" ADD VALUE 'REPLY';

-- AlterTable
ALTER TABLE "comments" ADD COLUMN "parent_id" UUID;

-- CreateIndex
CREATE INDEX "comments_parent_id_created_at_id_idx" ON "comments"("parent_id", "created_at", "id");

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
