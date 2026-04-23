import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { resolveUser } from "../lib/getOrCreateUser";
import { handleServiceError } from "../lib/errors";
import * as threadsService from "../services/threads";

/* ─── Type interfaces ─── */

interface CreateThreadBody {
  title: string;
  body: string;
  bookId?: string | null;
  spoiler?: boolean;
}

interface ReplyBody {
  body: string;
}

/* ─── Route handlers ─── */

async function listThreadsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { filter = "recent", search, page = 1, limit = 20 } = request.query as {
    filter?: "all" | "popular" | "recent" | "mine";
    search?: string;
    page?: number;
    limit?: number;
  };
  const user = await resolveUser(request);
  try {
    const result = await threadsService.listThreads(user.id, filter, search, page, limit);
    return reply.send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function createThreadHandler(request: FastifyRequest, reply: FastifyReply) {
  const { title, body, bookId, spoiler = false } = request.body as CreateThreadBody;
  const user = await resolveUser(request);
  try {
    const result = await threadsService.createThread(user.id, title, body, bookId, spoiler);
    return reply.code(201).send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function getThreadHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const user = await resolveUser(request);
  try {
    const result = await threadsService.getThread(id, user.id);
    return reply.send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function postReplyHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id: threadId } = request.params as { id: string };
  const { body } = request.body as ReplyBody;
  const user = await resolveUser(request);
  try {
    const result = await threadsService.postReply(user.id, threadId, body);
    return reply.code(201).send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function toggleLikeHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id: threadId } = request.params as { id: string };
  const user = await resolveUser(request);
  try {
    const result = await threadsService.toggleLike(user.id, threadId);
    return reply.send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function deleteThreadHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const user = await resolveUser(request);
  try {
    await threadsService.deleteThread(user.id, id);
    return reply.code(204).send();
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

/* ─── Route registration ─── */

export async function threadsRoute(app: FastifyInstance) {
  app.get("/threads", {
    schema: {
      tags: ["discussions"],
      summary: "List discussion threads",
      security: [{ bearerAuth: [] }],
      querystring: { $ref: "ThreadFilterQuery" },
      response: {
        200: { $ref: "PaginatedThreads" },
        401: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: listThreadsHandler,
  });

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
    handler: createThreadHandler,
  });

  app.get("/threads/:id", {
    schema: {
      tags: ["discussions"],
      summary: "Get a thread with its replies",
      security: [{ bearerAuth: [] }],
      params: { $ref: "IdParam" },
      response: {
        200: { $ref: "ThreadDetail" },
        401: { $ref: "ApiError" },
        404: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: getThreadHandler,
  });

  app.post("/threads/:id/replies", {
    schema: {
      tags: ["discussions"],
      summary: "Post a reply to a thread",
      security: [{ bearerAuth: [] }],
      params: { $ref: "IdParam" },
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
    handler: postReplyHandler,
  });

  app.post("/threads/:id/like", {
    schema: {
      tags: ["discussions"],
      summary: "Toggle like on a thread",
      security: [{ bearerAuth: [] }],
      params: { $ref: "IdParam" },
      response: {
        200: { $ref: "LikeResult" },
        401: { $ref: "ApiError" },
        404: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: toggleLikeHandler,
  });

  app.delete("/threads/:id", {
    schema: {
      tags: ["discussions"],
      summary: "Soft-delete a thread (only the creator may do this)",
      security: [{ bearerAuth: [] }],
      params: { $ref: "IdParam" },
      response: {
        204: { type: "null", description: "Deleted successfully" },
        401: { $ref: "ApiError" },
        403: { $ref: "ApiError", description: "Not the thread owner" },
        404: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: deleteThreadHandler,
  });
}
