-- DropForeignKey
ALTER TABLE "posts" DROP CONSTRAINT "posts_district_id_fkey";

-- AlterTable
ALTER TABLE "posts" ALTER COLUMN "district_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
