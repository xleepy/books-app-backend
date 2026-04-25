import { db } from "../lib/db";
import { bookInclude } from "../lib/includes";
import { toBook } from "../lib/mappers";
import { NotFoundError } from "../lib/errors";

const MAX_FEED_CANDIDATES = 500;

/* ─── Feed helpers ─── */

async function buildPersonalizedFeed(
  offset: number,
  limit: number,
  excludedBookIds: string[],
  subjectFreq: Map<string, number>,
) {
  const where = excludedBookIds.length
    ? { id: { notIn: excludedBookIds } }
    : undefined;

  const candidates = await db.book.findMany({
    where,
    include: bookInclude,
    take: MAX_FEED_CANDIDATES,
  });

  const getRatingCountOrZero = (book: (typeof candidates)[number]) =>
    book.ratingCount ?? 0;

  const scored = candidates
    .map((book) => {
      const score = book.bookSubjects.reduce(
        (sum, bs) => sum + (subjectFreq.get(bs.subjectId) ?? 0),
        0,
      );
      return { book, score };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        getRatingCountOrZero(b.book) - getRatingCountOrZero(a.book) ||
        Number(b.book.ratingAvg) - Number(a.book.ratingAvg),
    );

  const page = scored.slice(offset, offset + limit);
  const hasMore = scored.length > offset + limit;
  const nextCursor = hasMore
    ? Buffer.from(String(offset + limit)).toString("base64url")
    : null;

  return { data: page.map((s) => toBook(s.book)), nextCursor };
}

async function buildPopularFeed(
  offset: number,
  limit: number,
  excludedBookIds: string[],
) {
  const where = excludedBookIds.length
    ? { id: { notIn: excludedBookIds } }
    : undefined;

  const rows = await db.book.findMany({
    where,
    orderBy: [{ ratingCount: "desc" }, { ratingAvg: "desc" }],
    skip: offset,
    take: limit + 1,
    include: bookInclude,
  });

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map(toBook);
  const nextCursor = hasMore
    ? Buffer.from(String(offset + limit)).toString("base64url")
    : null;

  return { data, nextCursor };
}

/* ─── Exported service functions ─── */

const BASE_GENRE_WEIGHT = 1;

export async function getFeed(authSub?: string, cursor?: string, limit = 20) {
  const offset = cursor
    ? parseInt(Buffer.from(cursor, "base64url").toString(), 10)
    : 0;

  let excludedBookIds: string[] = [];
  let subjectFreq = new Map<string, number>();

  if (authSub) {
    const user = await db.user.findUnique({ where: { authId: authSub } });
    if (user) {
      const [libraryItems, passedSwipes, prefs] = await Promise.all([
        db.libraryItem.findMany({
          where: { userId: user.id },
          select: { bookId: true },
        }),
        db.swipe.findMany({
          where: { userId: user.id, direction: "left" },
          select: { bookId: true },
        }),
        db.userPreferences.findUnique({
          where: { userId: user.id },
          select: { preferredGenres: true },
        }),
      ]);
      const libraryBookIds = libraryItems.map((item) => item.bookId);
      excludedBookIds = [
        ...libraryBookIds,
        ...passedSwipes.map((s) => s.bookId),
      ];

      // Seed subjectFreq from explicit preferred genres
      if (prefs?.preferredGenres.length) {
        const preferredSubjects = await db.subject.findMany({
          where: { name: { in: prefs.preferredGenres, mode: "insensitive" } },
          select: { id: true },
        });
        for (const { id } of preferredSubjects) {
          subjectFreq.set(id, (subjectFreq.get(id) ?? 0) + BASE_GENRE_WEIGHT);
        }
      }

      // Layer library-derived signals on top
      if (libraryBookIds.length > 0) {
        const librarySubjects = await db.bookSubject.findMany({
          where: { bookId: { in: libraryBookIds } },
          select: { subjectId: true },
        });
        for (const { subjectId } of librarySubjects) {
          subjectFreq.set(subjectId, (subjectFreq.get(subjectId) ?? 0) + 1);
        }
      }
    }
  }

  if (subjectFreq.size > 0) {
    return buildPersonalizedFeed(offset, limit, excludedBookIds, subjectFreq);
  }

  return buildPopularFeed(offset, limit, excludedBookIds);
}

export async function listBooks(
  page: number,
  limit: number,
  q?: string,
  tag?: string,
) {
  const where = {
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { author: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(tag
      ? {
          bookSubjects: { some: { subject: { slug: tag } } },
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.book.count({ where }),
    db.book.findMany({
      where,
      orderBy: [{ ratingCount: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: bookInclude,
    }),
  ]);

  return { data: rows.map(toBook), pagination: { total, page, limit } };
}

export async function getBook(id: string) {
  const book = await db.book.findUnique({
    where: { id },
    include: bookInclude,
  });
  if (!book) throw new NotFoundError("Book not found");
  return toBook(book);
}

export async function getRecommendations(id: string, limit = 10) {
  const book = await db.book.findUnique({
    where: { id },
    include: { bookSubjects: true },
  });
  if (!book) throw new NotFoundError("Book not found");

  const subjectIds = book.bookSubjects.map((bs) => bs.subjectId);
  if (!subjectIds.length) return { data: [] };

  const rows = await db.book.findMany({
    where: {
      id: { not: id },
      bookSubjects: { some: { subjectId: { in: subjectIds } } },
    },
    orderBy: [{ ratingCount: "desc" }],
    take: limit,
    include: bookInclude,
  });

  return { data: rows.map(toBook) };
}

export async function listSubjects() {
  const rows = await db.subject.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });
  return { data: rows };
}
