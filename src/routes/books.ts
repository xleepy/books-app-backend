import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { handleServiceError } from "../lib/errors";
import * as booksService from "../services/books";

/* ─── Type interfaces ─── */

interface ListBooksQuery {
  page?: number;
  limit?: number;
  q?: string;
  tag?: string;
}

/* ─── Route handlers ─── */

async function getFeedHandler(request: FastifyRequest, reply: FastifyReply) {
  const { cursor, limit = 20 } = request.query as { cursor?: string; limit?: number };
  try {
    const result = await booksService.getFeed(request.user?.sub, cursor, limit);
    return reply.send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function listBooksHandler(request: FastifyRequest, reply: FastifyReply) {
  const { page = 1, limit = 20, q, tag } = request.query as ListBooksQuery;
  try {
    const result = await booksService.listBooks(page, limit, q, tag);
    return reply.send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function getBookHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  try {
    const result = await booksService.getBook(id);
    return reply.send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function getRecommendationsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const { limit = 10 } = request.query as { limit?: number };
  try {
    const result = await booksService.getRecommendations(id, limit);
    return reply.send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

/* ─── Route registration ─── */

export async function booksRoute(app: FastifyInstance) {
  app.get("/books/feed", {
    schema: {
      tags: ["books"],
      summary: "Swipe-deck feed (cursor-paginated, personalized by liked-book subjects for authed users)",
      querystring: { $ref: "CursorQuery" },
      response: {
        200: { $ref: "BookList" },
      },
    },
    preHandler: [app.authenticate],
    handler: getFeedHandler,
  });

  app.get("/books", {
    schema: {
      tags: ["books"],
      summary: "List books (paginated, searchable, filterable by tag)",
      querystring: {
        allOf: [
          { $ref: "PaginationQuery" },
          {
            type: "object",
            properties: {
              q: { type: "string", description: "Full-text search on title / author" },
              tag: { type: "string", description: "Filter by subject slug" },
            },
          },
        ],
      },
      response: {
        200: { $ref: "PaginatedBooks" },
      },
    },
    handler: listBooksHandler,
  });

  app.get("/books/:id", {
    schema: {
      tags: ["books"],
      summary: "Get a single book by ID",
      params: { $ref: "IdParam" },
      response: {
        200: { $ref: "Book" },
        404: { $ref: "ApiError" },
      },
    },
    handler: getBookHandler,
  });

  app.get("/books/:id/recommendations", {
    schema: {
      tags: ["books"],
      summary: "Get recommended books similar to a given book (subject overlap)",
      params: { $ref: "IdParam" },
      querystring: { $ref: "LimitQuery" },
      response: {
        200: { $ref: "BookList" },
        404: { $ref: "ApiError" },
      },
    },
    handler: getRecommendationsHandler,
  });
}
