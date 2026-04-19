import type { FastifyInstance } from "fastify";

export async function healthRoute(app: FastifyInstance) {
  app.get("/healthz", {
    schema: {
      tags: ["health"],
      summary: "Health check",
      response: {
        200: {
          type: "object",
          required: ["status"],
          properties: { status: { type: "string" } },
        },
      },
    },
    handler: async () => ({ status: "ok" }),
  });
}
