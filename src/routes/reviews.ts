import type { FastifyInstance } from "fastify";

export async function reviewsRoute(app: FastifyInstance) {
  app.get("/books/:id/reviews", {
    schema: {
      tags: ["reviews"],
      summary: "List reviews for a book",
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      querystring: {
        type: "object",
        properties: {
          page: { type: "integer", minimum: 1, default: 1 },
          limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
        },
      },
      response: {
        200: {
          type: "object",
          required: ["data", "pagination"],
          properties: {
            data: { type: "array", items: { $ref: "Review" } },
            pagination: { $ref: "Pagination" },
          },
        },
        404: { $ref: "ApiError" },
      },
    },
    handler: async (_req, reply) => reply.notImplemented(),
  });

  app.post("/books/:id/reviews", {
    schema: {
      tags: ["reviews"],
      summary: "Submit a review for a book",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      body: {
        type: "object",
        required: ["rating", "text"],
        properties: {
          rating: { type: "number", minimum: 1, maximum: 5 },
          text: { type: "string", minLength: 1 },
        },
      },
      response: {
        201: { $ref: "Review" },
        401: { $ref: "ApiError" },
        404: { $ref: "ApiError" },
        409: { $ref: "ApiError", description: "User already reviewed this book" },
      },
    },
    handler: async (_req, reply) => reply.notImplemented(),
  });
}
