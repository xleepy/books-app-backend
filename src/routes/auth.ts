import type { FastifyInstance } from "fastify";

export async function authRoute(app: FastifyInstance) {
  // Registration and login are handled entirely by Supabase on the client side.
  // The server only needs a logout endpoint to signal intent (JWTs are stateless;
  // actual token invalidation happens via Supabase refresh token revocation).
  app.post("/auth/logout", {
    schema: {
      tags: ["auth"],
      summary: "Log out (client must discard tokens; refresh token revocation handled client-side via Supabase)",
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: "object",
          required: ["ok"],
          properties: { ok: { type: "boolean" } },
        },
        401: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: async (_req, reply) => reply.send({ ok: true }),
  });
}
