-- CreateTable
CREATE TABLE "post_likes" (
    "user_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_likes_pkey" PRIMARY KEY ("user_id","post_id")
);

-- CreateTable
CREATE TABLE "reposts" (
    "user_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reposts_pkey" PRIMARY KEY ("user_id","post_id")
);

-- CreateIndex
CREATE INDEX "post_likes_post_id_idx" ON "post_likes"("post_id");

-- CreateIndex
CREATE INDEX "reposts_post_id_idx" ON "reposts"("post_id");

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reposts" ADD CONSTRAINT "reposts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reposts" ADD CONSTRAINT "reposts_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
