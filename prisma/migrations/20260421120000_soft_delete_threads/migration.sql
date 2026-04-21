-- AlterTable: add soft-delete column to threads
ALTER TABLE "threads" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- AlterTable: add soft-delete column to thread_replies
ALTER TABLE "thread_replies" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- CreateIndex: threads by recency (for filter=recent)
CREATE INDEX "threads_created_at_idx" ON "threads"("created_at" DESC);

-- CreateIndex: threads by popularity (for filter=popular)
CREATE INDEX "threads_likes_created_at_idx" ON "threads"("likes" DESC, "created_at" DESC);
