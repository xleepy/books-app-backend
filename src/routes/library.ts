import type { FastifyInstance } from "fastify";
import { db } from "../lib/db";
import { toLibraryBook } from "../lib/mappers";
import { getOrCreateUser } from "../lib/getOrCreateUser";
import { LibraryItemStatus } from "../generated/prisma/client";
import { XP_VALUES, computeLevelInfo } from "../lib/xp";
import { checkAndAwardBadges } from "../lib/badges";

const bookInclude = { bookSubjects: { include: { subject: true } } } as const;

/**
 * Called after a book transitions to "finished".
 * Awards XP, updates streak, checks badges, and increments progress on all
 * currently-active challenges for the user.
 */
async function onBookFinished(userId: string, book: { pageCount?: number | null }): Promise<void> {
  const today = new Date();

  await db.$transaction(async (tx) => {
    const pageCount = book.pageCount ?? 0;
    await tx.user.update({
      where: { id: userId },
      data: {
        booksFinished: { increment: 1 },
        pagesRead: { increment: pageCount },
        hoursRead: { increment: Math.round((pageCount / 30) * 100) / 100 },
      },
    });

    const previousBooks = await tx.libraryItem.count({
      where: { userId, status: "finished" },
    });
    await tx.xpEvent.create({
      data: { userId, source: "book_finished", xp: XP_VALUES.book_finished, meta: { pageCount } },
    });
    const afterFinish = await tx.user.update({
      where: { id: userId },
      data: { xpTotal: { increment: XP_VALUES.book_finished } },
      select: { xpTotal: true, level: true, levelTitle: true },
    });
    const levelInfo = computeLevelInfo(afterFinish.xpTotal);
    if (afterFinish.level !== levelInfo.level || afterFinish.levelTitle !== levelInfo.levelTitle) {
      await tx.user.update({
        where: { id: userId },
        data: { level: levelInfo.level, levelTitle: levelInfo.levelTitle },
      });
    }
    if (previousBooks === 1) {
      await tx.xpEvent.create({
        data: { userId, source: "first_book", xp: XP_VALUES.first_book, meta: {} },
      });
      await tx.user.update({
        where: { id: userId },
        data: { xpTotal: { increment: XP_VALUES.first_book } },
      });
    }

    const user = await tx.user.findUnique({ where: { id: userId } });
    if (user) {
      const today_ = new Date();
      const isoDow = today_.getDay() === 0 ? 6 : today_.getDay() - 1;
      let newStreak = user.streak;
      const prevDate = user.streakLastDate;
      if (prevDate) {
        const prevDay = new Date(prevDate.getFullYear(), prevDate.getMonth(), prevDate.getDate());
        const diff = Math.round((today_.getTime() - prevDay.getTime()) / (24 * 60 * 60 * 1000));
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
        data: { streak: newStreak, bestStreak: Math.max(newStreak, user.bestStreak), streakLastDate: today_, weekDays },
      });
    }

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
        await tx.xpEvent.create({
          data: { userId, source: "challenge", xp: XP_VALUES.challenge, meta: { challengeId: challenge.id, challengeTitle: challenge.title } },
        });
        const updated = await tx.user.update({
          where: { id: userId },
          data: { xpTotal: { increment: XP_VALUES.challenge } },
          select: { xpTotal: true, level: true, levelTitle: true },
        });
        const li = computeLevelInfo(updated.xpTotal);
        if (updated.level !== li.level || updated.levelTitle !== li.levelTitle) {
          await tx.user.update({ where: { id: userId }, data: { level: li.level, levelTitle: li.levelTitle } });
        }
      }
    }
  });

  await checkAndAwardBadges(userId, "book_finished");
}

export async function libraryRoute(app: FastifyInstance) {
  app.get("/library/stats", {
    schema: {
      tags: ["library"],
      summary: "Counts of the authenticated user's books by reading status",
      security: [{ bearerAuth: [] }],
      response: {
        200: { $ref: "LibraryStats" },
        401: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { sub, email, user_metadata } = request.user;
      const user = await getOrCreateUser(sub, email, user_metadata?.full_name ?? user_metadata?.name);

      const [finished, reading, want] = await Promise.all([
        db.libraryItem.count({ where: { userId: user.id, status: "finished" } }),
        db.libraryItem.count({ where: { userId: user.id, status: "reading" } }),
        db.libraryItem.count({ where: { userId: user.id, status: "want" } }),
      ]);

      return reply.send({ finished, reading, saved: want });
    },
  });

  app.get("/library", {
    schema: {
      tags: ["library"],
      summary: "Get the authenticated user's saved books",
      security: [{ bearerAuth: [] }],
      querystring: {
        type: "object",
        properties: {
          page: { type: "integer", minimum: 1, default: 1 },
          limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          status: { type: "string", enum: ["want", "reading", "finished"] },
        },
      },
      response: {
        200: {
          type: "object",
          required: ["data", "pagination"],
          properties: {
            data: { type: "array", items: { $ref: "LibraryBook" } },
            pagination: { $ref: "Pagination" },
          },
        },
        401: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { page = 1, limit = 20, status } = request.query as {
        page?: number;
        limit?: number;
        status?: LibraryItemStatus;
      };
      const { sub, email, user_metadata } = request.user;
      const user = await getOrCreateUser(sub, email, user_metadata?.full_name ?? user_metadata?.name);

      const where = { userId: user.id, ...(status ? { status } : {}) };
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

      return reply.send({
        data: rows.map(toLibraryBook),
        pagination: { total, page, limit },
      });
    },
  });

  app.post("/library", {
    schema: {
      tags: ["library"],
      summary: "Add a book to the authenticated user's library",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object",
        required: ["bookId", "status"],
        properties: {
          bookId: { type: "string" },
          status: { type: "string", enum: ["want", "reading", "finished"] },
        },
      },
      response: {
        201: { $ref: "LibraryBook" },
        401: { $ref: "ApiError" },
        404: { $ref: "ApiError", description: "Book not found" },
        409: { $ref: "ApiError", description: "Book already in library" },
      },
    },
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { bookId, status } = request.body as { bookId: string; status: LibraryItemStatus };
      const { sub, email, user_metadata } = request.user;
      const user = await getOrCreateUser(sub, email, user_metadata?.full_name ?? user_metadata?.name);

      const book = await db.book.findUnique({ where: { id: bookId } });
      if (!book) return reply.notFound("Book not found");

      const existing = await db.libraryItem.findUnique({
        where: { userId_bookId: { userId: user.id, bookId } },
      });
      if (existing) return reply.conflict("Book already in library");

      const item = await db.libraryItem.create({
        data: { userId: user.id, bookId, status },
        include: { book: { include: bookInclude } },
      });

      return reply.code(201).send(toLibraryBook(item));
    },
  });

  app.patch("/library/:bookId", {
    schema: {
      tags: ["library"],
      summary: "Update reading status, progress, or current book flag",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["bookId"],
        properties: { bookId: { type: "string" } },
      },
      body: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["want", "reading", "finished"] },
          progressPct: { type: "number", minimum: 0, maximum: 100 },
          timeLeftMin: { type: "integer", minimum: 0, nullable: true },
          isCurrent: { type: "boolean" },
        },
      },
      response: {
        200: { $ref: "LibraryBook" },
        401: { $ref: "ApiError" },
        404: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { bookId } = request.params as { bookId: string };
      const { status, progressPct, timeLeftMin, isCurrent } = request.body as {
        status?: LibraryItemStatus;
        progressPct?: number;
        timeLeftMin?: number | null;
        isCurrent?: boolean;
      };
      const { sub, email, user_metadata } = request.user;
      const user = await getOrCreateUser(sub, email, user_metadata?.full_name ?? user_metadata?.name);

      const existing = await db.libraryItem.findUnique({
        where: { userId_bookId: { userId: user.id, bookId } },
      });
      if (!existing) return reply.notFound("Book not in library");

      // Setting isCurrent=true requires unsetting all other current books first
      if (isCurrent === true) {
        await db.libraryItem.updateMany({
          where: { userId: user.id, isCurrent: true },
          data: { isCurrent: false },
        });
      }

      const finishedAt =
        status === "finished" && existing.status !== "finished" ? new Date() : undefined;

      const item = await db.libraryItem.update({
        where: { userId_bookId: { userId: user.id, bookId } },
        data: {
          ...(status !== undefined && { status }),
          ...(progressPct !== undefined && { progressPct }),
          ...(timeLeftMin !== undefined && { timeLeftMin }),
          ...(isCurrent !== undefined && { isCurrent }),
          ...(finishedAt && { finishedAt }),
        },
        include: { book: { include: bookInclude } },
      });

      // Fire gamification pipeline when a book is newly finished
      if (status === "finished" && existing.status !== "finished") {
        await onBookFinished(user.id, item.book);
      }

      return reply.send(toLibraryBook(item));
    },
  });

  app.delete("/library/:bookId", {
    schema: {
      tags: ["library"],
      summary: "Remove a book from the authenticated user's library",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["bookId"],
        properties: { bookId: { type: "string" } },
      },
      response: {
        204: { type: "null", description: "Removed successfully" },
        401: { $ref: "ApiError" },
        404: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { bookId } = request.params as { bookId: string };
      const { sub, email, user_metadata } = request.user;
      const user = await getOrCreateUser(sub, email, user_metadata?.full_name ?? user_metadata?.name);

      const existing = await db.libraryItem.findUnique({
        where: { userId_bookId: { userId: user.id, bookId } },
      });
      if (!existing) return reply.notFound("Book not in library");

      await db.libraryItem.delete({ where: { userId_bookId: { userId: user.id, bookId } } });
      return reply.code(204).send();
    },
  });
}
