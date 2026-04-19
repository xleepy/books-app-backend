import type { FastifyInstance } from "fastify";

export async function booksRoute(app: FastifyInstance) {
  app.get("/books", {
    schema: {
      tags: ["books"],
      summary: "List books (paginated, searchable, filterable by tag)",
      querystring: {
        type: "object",
        properties: {
          page: { type: "integer", minimum: 1, default: 1 },
          limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          q: { type: "string", description: "Full-text search" },
          tag: { type: "string", description: "Filter by genre/tag" },
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
    handler: async (_req, reply) => reply.notImplemented(),
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
    handler: async (_req, reply) => reply.notImplemented(),
  });

  app.get("/books/:id/recommendations", {
    schema: {
      tags: ["books"],
      summary: "Get recommended books similar to a given book",
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
          properties: {
            data: { type: "array", items: { $ref: "Book" } },
          },
        },
        404: { $ref: "ApiError" },
      },
    },
    handler: async (_req, reply) => reply.notImplemented(),
  });
}
