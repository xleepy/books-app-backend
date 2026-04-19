import type { FastifyInstance } from "fastify";

export async function swipesRoute(app: FastifyInstance) {
  app.post("/swipes", {
    schema: {
      tags: ["swipes"],
      summary: "Record a swipe action (feeds the recommendation engine)",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object",
        required: ["bookId", "action"],
        properties: {
          bookId: { type: "string" },
          action: {
            type: "string",
            enum: ["like", "dislike", "bookmark"],
            description: "like = swipe right, dislike = swipe left, bookmark = save for later",
          },
        },
      },
      response: {
        204: { type: "null", description: "Swipe recorded" },
        401: { $ref: "ApiError" },
        404: { $ref: "ApiError", description: "Book not found" },
      },
    },
    handler: async (_req, reply) => reply.notImplemented(),
  });
}
