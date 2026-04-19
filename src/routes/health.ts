import type { FastifyInstance } from "fastify";

export async function healthRoute(app: FastifyInstance) {
  app.get("/healthz", async () => ({ status: "ok" }));
}
