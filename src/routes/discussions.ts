import type { FastifyInstance } from "fastify";

export async function discussionsRoute(app: FastifyInstance) {
  app.get("/discussions", {
    schema: {
      tags: ["discussions"],
      summary: "List discussion threads",
      querystring: {
        type: "object",
        properties: {
          page: { type: "integer", minimum: 1, default: 1 },
          limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
          bookId: { type: "string", description: "Filter threads by book" },
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
      },
    },
    handler: async (_req, reply) => reply.notImplemented(),
  });

  app.get("/discussions/:id", {
    schema: {
      tags: ["discussions"],
      summary: "Get a single discussion thread",
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      response: {
        200: { $ref: "Thread" },
        404: { $ref: "ApiError" },
      },
    },
    handler: async (_req, reply) => reply.notImplemented(),
  });

  app.post("/discussions/:id/like", {
    schema: {
      tags: ["discussions"],
      summary: "Toggle like on a discussion thread",
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
    handler: async (_req, reply) => reply.notImplemented(),
  });
}
