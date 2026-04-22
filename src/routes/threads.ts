import type { FastifyInstance } from "fastify";
import { db } from "../lib/db";
import { getOrCreateUser } from "../lib/getOrCreateUser";
import { sanitizeHtml } from "../lib/sanitize";
import { toThread, toThreadDetail, toThreadReply } from "../lib/mappers";

/** Build the include clause for a thread list query. */
function threadListInclude(userId: string) {
  return {
    creator: true,
    book: true,
    _count: { select: { replies: { where: { deletedAt: null } } } },
    threadLikes: { where: { userId }, select: { userId: true } },
  } as const;
}

export async function threadsRoute(app: FastifyInstance) {
  // ─── List threads ───────────────────────────────────────────────────────────

  app.get("/threads", {
    schema: {
      tags: ["discussions"],
      summary: "List discussion threads",
      security: [{ bearerAuth: [] }],
      querystring: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            enum: ["all", "popular", "recent", "mine"],
            default: "recent",
          },
          search: { type: "string" },
          page: { type: "integer", minimum: 1, default: 1 },
          limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
        },
      },
      response: {
        200: {
          type: "object",
          required: ["data", "pagination"],
          properties: {
            data: { type: "array", items: { $ref: "Thread" } },
            pagination: { $ref: "Pagination" },
          },
        },
        401: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { filter = "recent", search, page = 1, limit = 20 } = request.query as {
        filter?: "all" | "popular" | "recent" | "mine";
        search?: string;
        page?: number;
        limit?: number;
      };
      const { sub, email, user_metadata } = request.user;
      const user = await getOrCreateUser(sub, email, user_metadata?.full_name ?? user_metadata?.name);

      const where = {
        deletedAt: null,
        ...(filter === "mine" && { creatorId: user.id }),
        ...(search && {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            { preview: { contains: search, mode: "insensitive" as const } },
          ],
        }),
      };

      const orderBy =
        filter === "popular"
          ? [{ likes: "desc" as const }, { createdAt: "desc" as const }]
          : [{ createdAt: "desc" as const }];

      const [total, rows] = await Promise.all([
        db.thread.count({ where }),
        db.thread.findMany({
          where,
          orderBy,
          skip: (page - 1) * limit,
          take: limit,
          include: threadListInclude(user.id),
        }),
      ]);

      return reply.send({
        data: rows.map((t) => toThread(t, user.id)),
        pagination: { total, page, limit },
      });
    },
  });

  // ─── Create thread ──────────────────────────────────────────────────────────

  app.post("/threads", {
    schema: {
      tags: ["discussions"],
      summary: "Create a new discussion thread",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object",
        required: ["title", "body"],
        properties: {
          title: { type: "string", minLength: 1, maxLength: 200 },
          body: { type: "string", minLength: 1, maxLength: 10000 },
          bookId: { type: "string", nullable: true },
          spoiler: { type: "boolean", default: false },
        },
      },
      response: {
        201: { $ref: "Thread" },
        401: { $ref: "ApiError" },
        404: { $ref: "ApiError", description: "Book not found" },
      },
    },
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { title, body, bookId, spoiler = false } = request.body as {
        title: string;
        body: string;
        bookId?: string | null;
        spoiler?: boolean;
      };
      const { sub, email, user_metadata } = request.user;
      const user = await getOrCreateUser(sub, email, user_metadata?.full_name ?? user_metadata?.name);

      // Validate bookId if provided
      if (bookId) {
        const book = await db.book.findUnique({ where: { id: bookId } });
        if (!book) return reply.notFound("Book not found");
      }

      const sanitizedBody = sanitizeHtml(body);
      const sanitizedTitle = sanitizeHtml(title);
      const preview = sanitizedBody.slice(0, 140);

      const thread = await db.thread.create({
        data: {
          creatorId: user.id,
          bookId: bookId ?? null,
          title: sanitizedTitle,
          body: sanitizedBody,
          preview,
          spoiler,
        },
        include: threadListInclude(user.id),
      });

      return reply.code(201).send(toThread(thread, user.id));
    },
  });

  // ─── Thread detail (with replies) ──────────────────────────────────────────

  app.get("/threads/:id", {
    schema: {
      tags: ["discussions"],
      summary: "Get a thread with its replies",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      response: {
        200: { $ref: "ThreadDetail" },
        401: { $ref: "ApiError" },
        404: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const { sub, email, user_metadata } = request.user;
      const user = await getOrCreateUser(sub, email, user_metadata?.full_name ?? user_metadata?.name);

      const thread = await db.thread.findFirst({
        where: { id, deletedAt: null },
        include: {
          creator: true,
          book: true,
          replies: {
            where: { deletedAt: null },
            orderBy: { createdAt: "asc" },
            include: { user: true },
          },
          threadLikes: { where: { userId: user.id }, select: { userId: true } },
        },
      });

      if (!thread) return reply.notFound("Thread not found");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return reply.send(toThreadDetail(thread as any, user.id));
    },
  });

  // ─── Post a reply ───────────────────────────────────────────────────────────

  app.post("/threads/:id/replies", {
    schema: {
      tags: ["discussions"],
      summary: "Post a reply to a thread",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      body: {
        type: "object",
        required: ["body"],
        properties: {
          body: { type: "string", minLength: 1, maxLength: 5000 },
        },
      },
      response: {
        201: { $ref: "ThreadReply" },
        401: { $ref: "ApiError" },
        404: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { id: threadId } = request.params as { id: string };
      const { body } = request.body as { body: string };
      const { sub, email, user_metadata } = request.user;
      const user = await getOrCreateUser(sub, email, user_metadata?.full_name ?? user_metadata?.name);

      const thread = await db.thread.findFirst({ where: { id: threadId, deletedAt: null } });
      if (!thread) return reply.notFound("Thread not found");

      const sanitizedBody = sanitizeHtml(body);

      const reply_ = await db.threadReply.create({
        data: { threadId, userId: user.id, body: sanitizedBody },
        include: { user: true },
      });

      return reply.code(201).send(toThreadReply(reply_));
    },
  });

  // ─── Toggle like ────────────────────────────────────────────────────────────

  app.post("/threads/:id/like", {
    schema: {
      tags: ["discussions"],
      summary: "Toggle like on a thread",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      response: {
        200: {
          type: "object",
          required: ["liked", "likes"],
          properties: {
            liked: { type: "boolean" },
            likes: { type: "integer" },
          },
        },
        401: { $ref: "ApiError" },
        404: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { id: threadId } = request.params as { id: string };
      const { sub, email, user_metadata } = request.user;
      const user = await getOrCreateUser(sub, email, user_metadata?.full_name ?? user_metadata?.name);

      const thread = await db.thread.findFirst({ where: { id: threadId, deletedAt: null } });
      if (!thread) return reply.notFound("Thread not found");

      const existing = await db.threadLike.findUnique({
        where: { userId_threadId: { userId: user.id, threadId } },
      });

      let liked: boolean;

      if (existing) {
        liked = await db.$transaction(async (tx) => {
          await tx.threadLike.delete({ where: { userId_threadId: { userId: user.id, threadId } } });
          await tx.$queryRaw`UPDATE "Thread" SET likes = GREATEST(0, likes - 1) WHERE id = ${threadId}`;
          return false;
        });
      } else {
        liked = await db.$transaction(async (tx) => {
          await tx.threadLike.create({ data: { userId: user.id, threadId } });
          await tx.thread.update({ where: { id: threadId }, data: { likes: { increment: 1 } } });
          return true;
        });
      }

      const [{ likes }] = await db.$queryRaw<[{ likes: number }]>`
        SELECT likes FROM "Thread" WHERE id = ${threadId}
      `;
      return reply.send({ liked, likes });
    },
  });

  // ─── Delete thread (owner only) ─────────────────────────────────────────────

  app.delete("/threads/:id", {
    schema: {
      tags: ["discussions"],
      summary: "Soft-delete a thread (only the creator may do this)",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      response: {
        204: { type: "null", description: "Deleted successfully" },
        401: { $ref: "ApiError" },
        403: { $ref: "ApiError", description: "Not the thread owner" },
        404: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const { sub, email, user_metadata } = request.user;
      const user = await getOrCreateUser(sub, email, user_metadata?.full_name ?? user_metadata?.name);

      const thread = await db.thread.findFirst({ where: { id, deletedAt: null } });
      if (!thread) return reply.notFound("Thread not found");
      if (thread.creatorId !== user.id) return reply.forbidden("You are not the owner of this thread");

      await db.thread.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      return reply.code(204).send();
    },
  });
}
