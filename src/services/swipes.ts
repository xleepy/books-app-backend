import { db } from "../lib/db";
import { NotFoundError } from "../lib/errors";

export async function recordSwipe(
  userId: string,
  bookId: string,
  direction: "left" | "right"
) {
  const book = await db.book.findUnique({ where: { id: bookId }, select: { id: true } });
  if (!book) throw new NotFoundError("Book not found");

  await db.swipe.upsert({
    where: { userId_bookId: { userId, bookId } },
    create: { userId, bookId, direction },
    update: { direction },
  });
}
