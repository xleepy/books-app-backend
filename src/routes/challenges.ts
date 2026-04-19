import type { FastifyInstance } from "fastify";

export async function challengesRoute(app: FastifyInstance) {
  app.get("/challenges", {
    schema: {
      tags: ["challenges"],
      summary: "List active reading challenges",
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: "object",
          required: ["data"],
          properties: {
            data: { type: "array", items: { $ref: "Challenge" } },
          },
        },
        401: { $ref: "ApiError" },
      },
    },
    handler: async (_req, reply) => reply.notImplemented(),
  });

  app.get("/challenges/:id/leaderboard", {
    schema: {
      tags: ["challenges"],
      summary: "Get the leaderboard for a specific challenge",
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      querystring: {
        type: "object",
        properties: {
          limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
        },
      },
      response: {
        200: {
          type: "object",
          required: ["data"],
          properties: {
            data: { type: "array", items: { $ref: "LeaderboardEntry" } },
          },
        },
        404: { $ref: "ApiError" },
      },
    },
    handler: async (_req, reply) => reply.notImplemented(),
  });
}
