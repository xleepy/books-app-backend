import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { LibraryItemStatus } from "../generated/prisma/client";
import { resolveUser } from "../lib/getOrCreateUser";
import { handleServiceError } from "../lib/errors";
import * as libraryService from "../services/library";

/* ─── Type interfaces ─── */

interface LibraryQuery {
  page?: number;
  limit?: number;
  status?: LibraryItemStatus;
}

interface AddLibraryBody {
  bookId: string;
  status: LibraryItemStatus;
}

interface PatchLibraryBody {
  status?: LibraryItemStatus;
  progressPct?: number;
  currentPage?: number;
  timeLeftMin?: number | null;
}

/* ─── Route handlers ─── */

async function getLibraryStatsHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = await resolveUser(request);
  try {
    const result = await libraryService.getLibraryStats(user.id);
    return reply.send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function getLibraryHandler(request: FastifyRequest, reply: FastifyReply) {
  const { page = 1, limit = 20, status } = request.query as LibraryQuery;
  const user = await resolveUser(request);
  try {
    const result = await libraryService.getLibrary(user.id, page, limit, status);
    return reply.send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function addToLibraryHandler(request: FastifyRequest, reply: FastifyReply) {
  const { bookId, status } = request.body as AddLibraryBody;
  const user = await resolveUser(request);
  try {
    const result = await libraryService.addToLibrary(user.id, bookId, status);
    return reply.code(201).send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function updateLibraryItemHandler(request: FastifyRequest, reply: FastifyReply) {
  const { bookId } = request.params as { bookId: string };
  const { status, progressPct, currentPage, timeLeftMin } = request.body as PatchLibraryBody;
  const user = await resolveUser(request);
  try {
    const result = await libraryService.updateLibraryItem(
      user.id,
      bookId,
      status,
      progressPct,
      currentPage,
      timeLeftMin
    );
    return reply.send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function removeFromLibraryHandler(request: FastifyRequest, reply: FastifyReply) {
  const { bookId } = request.params as { bookId: string };
  const user = await resolveUser(request);
  try {
    await libraryService.removeFromLibrary(user.id, bookId);
    return reply.code(204).send();
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

/* ─── Route registration ─── */

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
    handler: getLibraryStatsHandler,
  });

  app.get("/library", {
    schema: {
      tags: ["library"],
      summary: "Get the authenticated user's saved books",
      security: [{ bearerAuth: [] }],
      querystring: {
        allOf: [
          { $ref: "PaginationQuery" },
          {
            type: "object",
            properties: {
              status: { type: "string", enum: ["want", "reading", "finished"] },
            },
          },
        ],
      },
      response: {
        200: { $ref: "PaginatedLibraryBooks" },
        401: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: getLibraryHandler,
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
    handler: addToLibraryHandler,
  });

  app.patch("/library/:bookId", {
    schema: {
      tags: ["library"],
      summary: "Update reading status, progress, or current book flag",
      security: [{ bearerAuth: [] }],
      params: { $ref: "BookIdParam" },
      body: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["want", "reading", "finished"] },
          progressPct: { type: "number", minimum: 0, maximum: 100 },
          currentPage: { type: "integer", minimum: 0 },
          timeLeftMin: { type: "integer", minimum: 0, nullable: true },
        },
      },
      response: {
        200: { $ref: "LibraryBook" },
        401: { $ref: "ApiError" },
        404: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: updateLibraryItemHandler,
  });

  app.delete("/library/:bookId", {
    schema: {
      tags: ["library"],
      summary: "Remove a book from the authenticated user's library",
      security: [{ bearerAuth: [] }],
      params: { $ref: "BookIdParam" },
      response: {
        204: { type: "null", description: "Removed successfully" },
        401: { $ref: "ApiError" },
        404: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: removeFromLibraryHandler,
  });
}
