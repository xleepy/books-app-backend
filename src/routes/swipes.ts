import type { FastifyInstance } from "fastify";
import { db } from "../lib/db";
import { getOrCreateUser } from "../lib/getOrCreateUser";

export async function swipesRoute(app: FastifyInstance) {
  app.post("/swipes", {
    schema: {
      tags: ["swipes"],
      summary: "Record a swipe on a book (left = pass, right = like)",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object",
        required: ["bookId", "direction"],
        properties: {
          bookId: { type: "string" },
          direction: { type: "string", enum: ["left", "right"] },
        },
      },
      response: {
        204: { type: "null" },
        401: { $ref: "ApiError" },
        404: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { sub, email, user_metadata } = request.user;
      const { bookId, direction } = request.body as { bookId: string; direction: "left" | "right" };

      const user = await getOrCreateUser(sub, email, user_metadata?.full_name ?? user_metadata?.name);

      const book = await db.book.findUnique({ where: { id: bookId }, select: { id: true } });
      if (!book) return reply.notFound("Book not found");

      await db.swipe.upsert({
        where: { userId_bookId: { userId: user.id, bookId } },
        create: { userId: user.id, bookId, direction },
        update: { direction },
      });

      return reply.code(204).send();
    },
  });
}
