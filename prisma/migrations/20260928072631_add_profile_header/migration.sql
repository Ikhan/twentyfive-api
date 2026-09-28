-- AlterEnum
ALTER TYPE "MediaPurpose" ADD VALUE 'HEADER';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "header_url" TEXT;
