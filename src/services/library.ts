import { db } from "../lib/db";
import { Prisma, LibraryItemStatus } from "../generated/prisma/client";
import { bookInclude } from "../lib/includes";
import { toLibraryBook } from "../lib/mappers";
import { NotFoundError, ConflictError } from "../lib/errors";
import { XP_VALUES, computeLevelInfo } from "../lib/xp";
import { checkAndAwardBadges } from "../lib/badges";
import { sendChallengeCompleteNotification } from "./notifications";

type TxClient = Prisma.TransactionClient;

/* ─── Internal gamification helpers ─── */

async function incrementUserStats(
  tx: TxClient,
  userId: string,
  pageCount: number,
) {
  await tx.user.update({
    where: { id: userId },
    data: {
      booksFinished: { increment: 1 },
      pagesRead: { increment: pageCount },
      hoursRead: { increment: Math.round((pageCount / 30) * 100) / 100 },
    },
  });
}

async function awardXpAndLevelUp(
  tx: TxClient,
  userId: string,
  source: string,
  xp: number,
  meta: Prisma.InputJsonValue,
) {
  await tx.xpEvent.create({ data: { userId, source, xp, meta } });
  const updated = await tx.user.update({
    where: { id: userId },
    data: { xpTotal: { increment: xp } },
    select: { xpTotal: true, level: true, levelTitle: true },
  });
  const levelInfo = computeLevelInfo(updated.xpTotal);
  if (
    updated.level !== levelInfo.level ||
    updated.levelTitle !== levelInfo.levelTitle
  ) {
    await tx.user.update({
      where: { id: userId },
      data: { level: levelInfo.level, levelTitle: levelInfo.levelTitle },
    });
  }
  return updated;
}

async function maybeAwardFirstBookXp(
  tx: TxClient,
  userId: string,
  previousBooks: number,
) {
  if (previousBooks !== 1) return;
  await tx.xpEvent.create({
    data: { userId, source: "first_book", xp: XP_VALUES.first_book, meta: {} },
  });
  await tx.user.update({
    where: { id: userId },
    data: { xpTotal: { increment: XP_VALUES.first_book } },
  });
}

async function updateReadingStreak(tx: TxClient, userId: string, today: Date) {
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const isoDow = today.getDay() === 0 ? 6 : today.getDay() - 1;
  let newStreak = user.streak;
  const prevDate = user.streakLastDate;

  if (prevDate) {
    const prevDay = new Date(
      prevDate.getFullYear(),
      prevDate.getMonth(),
      prevDate.getDate(),
    );
    const diff = Math.round(
      (today.getTime() - prevDay.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (diff === 0) {
      // already counted today
    } else if (diff === 1) {
      newStreak = user.streak + 1;
    } else {
      newStreak = 1;
    }
  } else {
    newStreak = 1;
  }

  const weekDays = [...user.weekDays] as boolean[];
  weekDays[isoDow] = true;

  await tx.user.update({
    where: { id: userId },
    data: {
      streak: newStreak,
      bestStreak: Math.max(newStreak, user.bestStreak),
      streakLastDate: today,
      weekDays,
    },
  });
}

async function progressActiveChallenges(
  tx: TxClient,
  userId: string,
  today: Date,
) {
  const activeChallenges = await tx.challenge.findMany({
    where: { activeFrom: { lte: today }, activeTo: { gte: today } },
  });

  for (const challenge of activeChallenges) {
    const uc = await tx.userChallenge.upsert({
      where: { userId_challengeId: { userId, challengeId: challenge.id } },
      create: { userId, challengeId: challenge.id, current: 1 },
      update: { current: { increment: 1 } },
    });

    if (uc.current >= challenge.target && uc.completedAt == null) {
      await tx.userChallenge.update({
        where: { userId_challengeId: { userId, challengeId: challenge.id } },
        data: { completedAt: today },
      });
      await awardXpAndLevelUp(tx, userId, "challenge", XP_VALUES.challenge, {
        challengeId: challenge.id,
        challengeTitle: challenge.title,
      });
      // Fire push outside transaction so DB commit is guaranteed first
      sendChallengeCompleteNotification(userId, challenge.title).catch(
        () => {},
      );
    }
  }
}

export async function onBookFinished(
  userId: string,
  book: { pageCount?: number | null },
): Promise<void> {
  const today = new Date();
  const pageCount = book.pageCount ?? 0;

  await db.$transaction(async (tx) => {
    await incrementUserStats(tx, userId, pageCount);

    const previousBooks = await tx.libraryItem.count({
      where: { userId, status: "finished" },
    });

    await awardXpAndLevelUp(
      tx,
      userId,
      "book_finished",
      XP_VALUES.book_finished,
      { pageCount },
    );
    await maybeAwardFirstBookXp(tx, userId, previousBooks);
    await updateReadingStreak(tx, userId, today);
    await progressActiveChallenges(tx, userId, today);
  });

  await checkAndAwardBadges(userId, "book_finished");
}

function resolveProgress(
  existing: { book: { pageCount?: number | null } },
  currentPage?: number,
  progressPct?: number,
) {
  let resolvedProgressPct = progressPct;
  let resolvedCurrentPage = currentPage;
  const pageCount = existing.book.pageCount ?? 0;

  if (currentPage !== undefined && pageCount > 0) {
    resolvedCurrentPage = Math.max(0, Math.min(pageCount, currentPage));
    resolvedProgressPct = Math.round((resolvedCurrentPage / pageCount) * 100);
  }

  return { resolvedProgressPct, resolvedCurrentPage };
}

/* ─── Exported service functions ─── */

export async function getLibraryStats(userId: string) {
  const [finished, reading, want] = await Promise.all([
    db.libraryItem.count({ where: { userId, status: "finished" } }),
    db.libraryItem.count({ where: { userId, status: "reading" } }),
    db.libraryItem.count({ where: { userId, status: "want" } }),
  ]);

  return { finished, reading, saved: want };
}

export async function getLibrary(
  userId: string,
  page: number,
  limit: number,
  status?: LibraryItemStatus,
) {
  const where = { userId, ...(status ? { status } : {}) };
  const [total, rows] = await Promise.all([
    db.libraryItem.count({ where }),
    db.libraryItem.findMany({
      where,
      orderBy: { addedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { book: { include: bookInclude } },
    }),
  ]);

  return { data: rows.map(toLibraryBook), pagination: { total, page, limit } };
}

export async function addToLibrary(
  userId: string,
  bookId: string,
  status: LibraryItemStatus,
) {
  const book = await db.book.findUnique({ where: { id: bookId } });
  if (!book) throw new NotFoundError("Book not found");

  const existing = await db.libraryItem.findUnique({
    where: { userId_bookId: { userId, bookId } },
  });
  if (existing) throw new ConflictError("Book already in library");

  const item = await db.libraryItem.create({
    data: { userId, bookId, status },
    include: { book: { include: bookInclude } },
  });

  return toLibraryBook(item);
}

export async function updateLibraryItem(
  userId: string,
  bookId: string,
  status?: LibraryItemStatus,
  progressPct?: number,
  currentPage?: number,
  timeLeftMin?: number | null,
) {
  const existing = await db.libraryItem.findUnique({
    where: { userId_bookId: { userId, bookId } },
    include: { book: true },
  });
  if (!existing) throw new NotFoundError("Book not in library");

  const { resolvedProgressPct, resolvedCurrentPage } = resolveProgress(
    existing,
    currentPage,
    progressPct,
  );

  const finishedAt =
    status === "finished" && existing.status !== "finished"
      ? new Date()
      : undefined;

  const item = await db.libraryItem.update({
    where: { userId_bookId: { userId, bookId } },
    data: {
      ...(status !== undefined && { status }),
      ...(resolvedProgressPct !== undefined && {
        progressPct: resolvedProgressPct,
      }),
      ...(resolvedCurrentPage !== undefined && {
        currentPage: resolvedCurrentPage,
      }),
      ...(timeLeftMin !== undefined && { timeLeftMin }),
      ...(finishedAt && { finishedAt }),
    },
    include: { book: { include: bookInclude } },
  });

  if (status === "finished" && existing.status !== "finished") {
    await onBookFinished(userId, item.book);
  }

  return toLibraryBook(item);
}

export async function removeFromLibrary(userId: string, bookId: string) {
  const existing = await db.libraryItem.findUnique({
    where: { userId_bookId: { userId, bookId } },
  });
  if (!existing) throw new NotFoundError("Book not in library");

  await db.libraryItem.delete({ where: { userId_bookId: { userId, bookId } } });
}
