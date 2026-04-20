/*
  Warnings:

  - Changed the type of `status` on the `library_items` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "LibraryItemStatus" AS ENUM ('want', 'reading', 'finished');

-- AlterTable
ALTER TABLE "library_items"
  ALTER COLUMN "status" TYPE "LibraryItemStatus"
  USING "status"::"LibraryItemStatus";

-- CreateIndex
CREATE INDEX "library_items_user_id_idx" ON "library_items"("user_id");
