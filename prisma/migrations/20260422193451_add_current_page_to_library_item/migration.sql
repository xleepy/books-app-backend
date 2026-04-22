-- AlterTable
ALTER TABLE "library_items" ADD COLUMN     "current_page" INTEGER;

-- CreateIndex
CREATE INDEX "library_items_user_id_status_idx" ON "library_items"("user_id", "status");

-- CreateIndex
CREATE INDEX "reviews_book_id_idx" ON "reviews"("book_id");

-- CreateIndex
CREATE INDEX "reviews_user_id_idx" ON "reviews"("user_id");

-- CreateIndex
CREATE INDEX "thread_likes_thread_id_idx" ON "thread_likes"("thread_id");

-- CreateIndex
CREATE INDEX "xp_events_user_id_idx" ON "xp_events"("user_id");
