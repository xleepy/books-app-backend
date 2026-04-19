import type { FastifyInstance } from "fastify";
import { db } from "../lib/db";
import { toBook } from "../lib/mappers";

const bookInclude = {
  bookSubjects: { include: { subject: true } },
} as const;


export async function booksRoute(app: FastifyInstance) {
  app.get("/books/feed", {
    schema: {
      tags: ["books"],
      summary: "Swipe-deck feed (cursor-paginated, personalized by liked-book subjects for authed users)",
      querystring: {
        type: "object",
        properties: {
          cursor: { type: "string", description: "Opaque pagination cursor" },
          limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
        },
      },
      response: {
        200: {
          type: "object",
          required: ["data"],
          properties: {
            data: { type: "array", items: { $ref: "Book" } },
            nextCursor: { type: "string", nullable: true },
          },
        },
      },
    },
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { cursor, limit = 20 } = request.query as { cursor?: string; limit?: number };
      const offset = cursor ? parseInt(Buffer.from(cursor, "base64url").toString(), 10) : 0;

      let excludedBookIds: string[] = [];
      let subjectFreq = new Map<string, number>();

      if (request.user?.sub) {
        const user = await db.user.findUnique({ where: { authId: request.user.sub } });
        if (user) {
          const [libraryItems, passedSwipes] = await Promise.all([
            db.libraryItem.findMany({ where: { userId: user.id }, select: { bookId: true } }),
            db.swipe.findMany({ where: { userId: user.id, direction: "left" }, select: { bookId: true } }),
          ]);
          const libraryBookIds = libraryItems.map((item) => item.bookId);
          excludedBookIds = [
            ...libraryBookIds,
            ...passedSwipes.map((s) => s.bookId),
          ];

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

      const where = excludedBookIds.length ? { id: { notIn: excludedBookIds } } : undefined;

      // Personalized: fetch all candidates, score by subject overlap, sort in-memory
      if (subjectFreq.size > 0) {
        const candidates = await db.book.findMany({
          where,
          include: bookInclude,
        });

        const getRatingCountOrZero = (book: typeof candidates[number]) => book.ratingCount ?? 0;

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

        return reply.send({ data: page.map((s) => toBook(s.book)), nextCursor });
      }

      // Fallback: no likes yet — popularity sort with DB-level pagination
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

      return reply.send({ data, nextCursor });
    },
  });

  app.get("/books", {
    schema: {
      tags: ["books"],
      summary: "List books (paginated, searchable, filterable by tag)",
      querystring: {
        type: "object",
        properties: {
          page: { type: "integer", minimum: 1, default: 1 },
          limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          q: { type: "string", description: "Full-text search on title / author" },
          tag: { type: "string", description: "Filter by subject slug" },
        },
      },
      response: {
        200: {
          type: "object",
          required: ["data", "pagination"],
          properties: {
            data: { type: "array", items: { $ref: "Book" } },
            pagination: { $ref: "Pagination" },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const { page = 1, limit = 20, q, tag } = request.query as {
        page?: number;
        limit?: number;
        q?: string;
        tag?: string;
      };

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

      return reply.send({
        data: rows.map(toBook),
        pagination: { total, page, limit },
      });
    },
  });

  app.get("/books/:id", {
    schema: {
      tags: ["books"],
      summary: "Get a single book by ID",
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      response: {
        200: { $ref: "Book" },
        404: { $ref: "ApiError" },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const book = await db.book.findUnique({ where: { id }, include: bookInclude });
      if (!book) return reply.notFound("Book not found");
      return reply.send(toBook(book));
    },
  });

  app.get("/books/:id/recommendations", {
    schema: {
      tags: ["books"],
      summary: "Get recommended books similar to a given book (subject overlap)",
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      querystring: {
        type: "object",
        properties: {
          limit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
        },
      },
      response: {
        200: {
          type: "object",
          required: ["data"],
          properties: { data: { type: "array", items: { $ref: "Book" } } },
        },
        404: { $ref: "ApiError" },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const { limit = 10 } = request.query as { limit?: number };

      const book = await db.book.findUnique({
        where: { id },
        include: { bookSubjects: true },
      });
      if (!book) return reply.notFound("Book not found");

      const subjectIds = book.bookSubjects.map((bs) => bs.subjectId);
      if (!subjectIds.length) return reply.send({ data: [] });

      const rows = await db.book.findMany({
        where: {
          id: { not: id },
          bookSubjects: { some: { subjectId: { in: subjectIds } } },
        },
        orderBy: [{ ratingCount: "desc" }],
        take: limit,
        include: bookInclude,
      });

      return reply.send({ data: rows.map(toBook) });
    },
  });
}
