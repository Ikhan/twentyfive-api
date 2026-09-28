-- CreateTable
CREATE TABLE "district_follows" (
    "user_id" UUID NOT NULL,
    "district_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "district_follows_pkey" PRIMARY KEY ("user_id","district_id")
);

-- CreateIndex
CREATE INDEX "district_follows_district_id_idx" ON "district_follows"("district_id");

-- AddForeignKey
ALTER TABLE "district_follows" ADD CONSTRAINT "district_follows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "district_follows" ADD CONSTRAINT "district_follows_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
