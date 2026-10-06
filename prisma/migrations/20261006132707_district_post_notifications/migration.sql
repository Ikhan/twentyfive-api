-- District post notifications: a bell on each district follow, and grouped "new posts in <district>" rows.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'DISTRICT_POST';

-- AlterTable
ALTER TABLE "district_follows" ADD COLUMN     "notify" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "district_id" TEXT,
ADD COLUMN     "post_count" INTEGER NOT NULL DEFAULT 1;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
