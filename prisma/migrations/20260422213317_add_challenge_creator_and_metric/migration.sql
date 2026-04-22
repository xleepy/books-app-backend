-- DropForeignKey
ALTER TABLE "user_challenges" DROP CONSTRAINT "user_challenges_challenge_id_fkey";

-- AlterTable
ALTER TABLE "challenges" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "creator_id" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "metric" TEXT NOT NULL DEFAULT 'books';

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_challenges" ADD CONSTRAINT "user_challenges_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
