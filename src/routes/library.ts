import type { FastifyInstance } from "fastify";

export async function libraryRoute(app: FastifyInstance) {
  app.get("/library/stats", {
    schema: {
      tags: ["library"],
      summary: "Get counts of the authenticated user's books by reading status",
      security: [{ bearerAuth: [] }],
      response: {
        200: { $ref: "LibraryStats" },
        401: { $ref: "ApiError" },
      },
    },
    handler: async (_req, reply) => reply.notImplemented(),
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
    handler: async (_req, reply) => reply.notImplemented(),
  });

  app.post("/library/:bookId", {
    schema: {
      tags: ["library"],
      summary: "Add a book to the authenticated user's library",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["bookId"],
        properties: { bookId: { type: "string" } },
      },
      response: {
        204: { type: "null", description: "Added successfully" },
        401: { $ref: "ApiError" },
        404: { $ref: "ApiError", description: "Book not found" },
        409: { $ref: "ApiError", description: "Book already in library" },
      },
    },
    handler: async (_req, reply) => reply.notImplemented(),
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
        404: { $ref: "ApiError", description: "Book not in library" },
      },
    },
    handler: async (_req, reply) => reply.notImplemented(),
  });
}
