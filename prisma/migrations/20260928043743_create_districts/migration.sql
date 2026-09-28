-- CreateEnum
CREATE TYPE "Province" AS ENUM ('WESTERN', 'CENTRAL', 'SOUTHERN', 'NORTHERN', 'EASTERN', 'NORTH_WESTERN', 'NORTH_CENTRAL', 'UVA', 'SABARAGAMUWA');

-- CreateTable
CREATE TABLE "districts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_si" TEXT NOT NULL,
    "name_ta" TEXT NOT NULL,
    "province" "Province" NOT NULL,
    "tagline" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "famous_for" TEXT[],
    "color_from" TEXT NOT NULL,
    "color_to" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "districts_name_key" ON "districts"("name");

-- CreateIndex
CREATE INDEX "districts_province_idx" ON "districts"("province");
