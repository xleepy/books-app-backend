import { db } from "../lib/db";
import { toReview } from "../lib/mappers";
import { sanitizeHtml } from "../lib/sanitize";
import { NotFoundError, ConflictError } from "../lib/errors";
import { awardXp, XP_VALUES } from "../lib/xp";
import { checkAndAwardBadges } from "../lib/badges";

export async function listReviews(bookId: string, page: number, limit: number) {
  const book = await db.book.findUnique({ where: { id: bookId } });
  if (!book) throw new NotFoundError("Book not found");

  const [total, rows] = await Promise.all([
    db.review.count({ where: { bookId } }),
    db.review.findMany({
      where: { bookId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: true },
    }),
  ]);

  return { data: rows.map(toReview), pagination: { total, page, limit } };
}

export async function createReview(
  userId: string,
  bookId: string,
  rating: number,
  text: string
) {
  const book = await db.book.findUnique({ where: { id: bookId } });
  if (!book) throw new NotFoundError("Book not found");

  const existing = await db.review.findFirst({ where: { bookId, userId } });
  if (existing) throw new ConflictError("You have already reviewed this book");

  const sanitizedText = sanitizeHtml(text);

  const review = await db.review.create({
    data: { bookId, userId, rating, text: sanitizedText },
    include: { user: true },
  });

  await awardXp(userId, "review", XP_VALUES.review, { bookId });
  await checkAndAwardBadges(userId, "review_written");

  return toReview(review);
}
