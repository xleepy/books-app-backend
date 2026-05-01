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

function toDateOnlyUTC(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function getIsoWeekStart(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  date.setHours(0, 0, 0, 0);
  return date;
}

async function updateReadingStreak(tx: TxClient, userId: string, today: Date) {
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const isoDow = today.getDay() === 0 ? 6 : today.getDay() - 1;
  let newStreak = user.streak;
  const prevDate = user.streakLastDate;

  if (prevDate) {
    const prevDay = toDateOnlyUTC(prevDate);
    const todayDay = toDateOnlyUTC(today);
    const diff = Math.round(
      (todayDay.getTime() - prevDay.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (diff === 0) {
      // already counted today — nothing to do
      return;
    } else if (diff === 1) {
      newStreak = user.streak + 1;
    } else {
      newStreak = 1;
    }
  } else {
    newStreak = 1;
  }

  // Week rollover: reset weekDays if we've crossed into a new ISO week
  let weekDays = [...user.weekDays] as boolean[];
  const weekStart = getIsoWeekStart(today);
  if (user.streakLastDate) {
    const prevWeekStart = getIsoWeekStart(toDateOnlyUTC(user.streakLastDate));
    if (weekStart > prevWeekStart) {
      weekDays = weekDays.map(() => false);
    }
  }
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

  // Award 50 XP + On Fire badge when crossing the 7-day milestone (once per streak run)
  const crossedSevenDay = newStreak > user.streak && newStreak % 7 === 0;
  if (crossedSevenDay) {
    await awardXpAndLevelUp(
      tx,
      userId,
      "streak_milestone",
      XP_VALUES.streak_milestone,
      {
        streakDays: 7,
      },
    );

    const badge = await tx.badge.findUnique({ where: { slug: "on-fire" } });
    if (badge) {
      const existing = await tx.userBadge.findUnique({
        where: { userId_badgeId: { userId, badgeId: badge.id } },
      });
      if (!existing) {
        await tx.userBadge.create({
          data: { userId, badgeId: badge.id },
        });
      }
    }
  }
}

async function maybeCompleteChallenge(
  tx: TxClient,
  userId: string,
  challenge: { id: string; title: string; target: number },
  uc: { current: number; completedAt: Date | null },
  today: Date,
) {
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
    sendChallengeCompleteNotification(userId, challenge.title).catch(() => {});
  }
}

async function progressBookChallenges(
  tx: TxClient,
  userId: string,
  today: Date,
) {
  const activeChallenges = await tx.challenge.findMany({
    where: {
      activeFrom: { lte: today },
      activeTo: { gte: today },
      metric: "books",
    },
  });

  for (const challenge of activeChallenges) {
    const uc = await tx.userChallenge.upsert({
      where: { userId_challengeId: { userId, challengeId: challenge.id } },
      create: { userId, challengeId: challenge.id, current: 1 },
      update: { current: { increment: 1 } },
    });

    await maybeCompleteChallenge(tx, userId, challenge, uc, today);
  }
}

async function progressPageChallenges(
  tx: TxClient,
  userId: string,
  pagesDelta: number,
  today: Date,
) {
  if (pagesDelta <= 0) return;

  const activeChallenges = await tx.challenge.findMany({
    where: {
      activeFrom: { lte: today },
      activeTo: { gte: today },
      metric: "pages",
    },
  });

  for (const challenge of activeChallenges) {
    const uc = await tx.userChallenge.upsert({
      where: { userId_challengeId: { userId, challengeId: challenge.id } },
      create: {
        userId,
        challengeId: challenge.id,
        current: pagesDelta,
      },
      update: { current: { increment: pagesDelta } },
    });

    await maybeCompleteChallenge(tx, userId, challenge, uc, today);
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
    await progressBookChallenges(tx, userId, today);
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

  const pagesDelta =
    resolvedCurrentPage !== undefined
      ? resolvedCurrentPage - (existing.currentPage ?? 0)
      : 0;

  if (pagesDelta > 0) {
    const today = new Date();
    await db.$transaction(async (tx) => {
      await updateReadingStreak(tx, userId, today);
      await progressPageChallenges(tx, userId, pagesDelta, today);
    });
  }

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
